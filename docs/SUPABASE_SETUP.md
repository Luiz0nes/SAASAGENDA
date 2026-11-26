# Configuração do Supabase — passo a passo

Você vai precisar de uma conta em https://supabase.com e do Node.js instalado.

## 1. Criar o projeto

1. No painel do Supabase, crie um novo projeto (escolha a região mais próxima dos seus clientes, por exemplo São Paulo).
2. Guarde a senha do banco em local seguro.
3. Em **Project Settings → API**, anote:
   - **Project URL** → vai em `VITE_SUPABASE_URL`
   - chave **anon / public** → vai em `VITE_SUPABASE_ANON_KEY`
   - o **Reference ID** do projeto (usado no passo 2)

> A chave **service_role** nunca deve ir para o frontend nem para o repositório. As Edge Functions já a recebem automaticamente do Supabase.

## 2. Aplicar o banco e publicar as funções (Supabase CLI)

Na raiz do repositório:

```bash
npx supabase login
npx supabase link --project-ref SEU_REFERENCE_ID
npx supabase db push            # aplica os arquivos de supabase/migrations em ordem
npx supabase functions deploy   # publica as 3 Edge Functions
```

**Alternativa sem CLI para o banco:** abra o **SQL Editor** e execute o conteúdo de cada arquivo de `supabase/migrations/`, um por vez, na ordem numérica (01 → 12). As Edge Functions ainda precisam ser publicadas pela CLI.

## 3. Configurar a autenticação

Em **Authentication → URL Configuration**:

- **Site URL:** o endereço do seu site (em desenvolvimento, `http://localhost:5173`).
- **Redirect URLs:** adicione `http://localhost:5173/redefinir-senha` e o equivalente do domínio de produção (`https://seudominio.com/redefinir-senha`).

Esses endereços são usados pelos e-mails de recuperação de senha e de convite.

Sobre e-mails: o serviço de e-mail padrão do Supabase tem limite baixo de envios e serve apenas para testes. Para produção, configure um SMTP próprio em **Authentication → Emails**. Enquanto isso, ao cadastrar um proprietário você pode informar uma **senha inicial**, o que dispensa o e-mail de convite.

## 4. Criar o primeiro SuperAdmin

1. Em **Authentication → Users**, clique em **Add user**, informe e-mail e senha e marque a confirmação automática do e-mail.
2. No **SQL Editor**, execute (trocando o e-mail):

   ```sql
   update public.profiles
   set is_super_admin = true, full_name = 'Seu Nome'
   where email = 'voce@exemplo.com';
   ```

Esse é o único passo manual. O campo `is_super_admin` não pode ser alterado pela aplicação: só pelo SQL Editor ou por outro SuperAdmin.

## 5. Rodar o frontend

```bash
cp .env.example .env   # preencha com os dados do passo 1
npm install
npm run dev
```

Acesse `http://localhost:5173/login` com o SuperAdmin.

## 6. Roteiro de verificação

Faça este roteiro uma vez para confirmar que tudo está ligado:

1. **SuperAdmin → Planos:** crie um plano com limite de 1 profissional.
2. **SuperAdmin → Estabelecimentos:** crie um estabelecimento com esse plano e uma senha inicial para o proprietário.
3. Saia e entre como o **proprietário**.
4. **Serviços:** crie um serviço. **Profissionais:** crie um profissional, vincule o serviço e defina os **Horários**. Tente criar um segundo profissional: o plano deve recusar.
5. **Horários e bloqueios:** confira o funcionamento e crie um bloqueio para amanhã à tarde.
6. Abra o **link público** (tela Início) em uma janela anônima e faça um agendamento. Os horários bloqueados e o intervalo do profissional não devem aparecer.
7. Tente agendar o mesmo horário de novo: ele não deve mais estar na lista.
8. No painel, em **Agenda**, confirme/conclua o atendimento e teste **Reagendar**.
9. Pelo link do agendamento (`/agendamento/<código>`), teste **Cancelar** como cliente.
10. Como SuperAdmin, **suspenda** o estabelecimento: a página pública deve sair do ar.
11. Crie um segundo estabelecimento e confirme que um proprietário não vê nada do outro.

## Problemas comuns

| Sintoma | Causa provável |
| --- | --- |
| Tela de login avisa para configurar o `.env` | `.env` ausente ou sem as duas variáveis; reinicie o `npm run dev` após criar |
| "Não foi possível concluir a operação" ao criar estabelecimento | Edge Functions não publicadas (`npx supabase functions deploy`) |
| Link de recuperação abre e diz "inválido ou expirou" | URL não cadastrada em Redirect URLs, ou link já usado |
| Serviço não aparece na página pública | Serviço inativo ou sem profissional ativo vinculado |
| Nenhum horário disponível | Profissional sem horários definidos, estabelecimento fechado no dia, ou antecedência mínima/máxima |

## Notificações no celular (Web Push)

Quando um cliente agenda pela página pública, o gatilho `appointments_push_notify`
chama a Edge Function `push-notify` (via `pg_net`), que envia a notificação para
os aparelhos da equipe que ativaram em **Início** ou **Configurações**.

Instalação nova:

1. Gere as chaves VAPID: `npx web-push generate-vapid-keys`.
2. No SQL Editor, guarde os segredos no Vault (nunca no repositório):
   ```sql
   select vault.create_secret('<chave pública>',  'vapid_public_key');
   select vault.create_secret('<chave privada>',  'vapid_private_key');
   select vault.create_secret('https://seu-dominio', 'vapid_subject');
   select vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'push_notify_secret');
   select vault.create_secret('https://<ref>.supabase.co/functions/v1/push-notify', 'push_function_url');
   ```
3. Publique a função: `supabase functions deploy push-notify --no-verify-jwt`.
4. Troque `VAPID_PUBLIC_KEY` em `src/lib/push.ts` pela sua chave pública.

iPhone/iPad (iOS 16.4+): abrir o painel no Safari → Compartilhar → Adicionar à
Tela de Início → abrir pelo ícone → entrar → **Ativar notificações**.
