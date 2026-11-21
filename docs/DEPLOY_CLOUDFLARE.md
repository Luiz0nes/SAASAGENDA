# Publicar no Cloudflare Pages

O Cloudflare Pages lê o repositório do GitHub, roda o build e publica o site. Depois da primeira vez, **cada `git push` na branch `main` publica sozinho** em 1 a 2 minutos.

O que já está pronto no repositório:

- `public/_redirects`: faz as rotas do React (`/agendar/...`, `/painel/...`) funcionarem ao abrir o link direto ou recarregar a página.
- `public/_headers`: cabeçalhos de segurança e cache.
- `.nvmrc`: usa Node 20 no build.

## 0. Antes: conferir o build no seu computador

```
cd %USERPROFILE%\Desktop\SAASAGENDA
git pull
npm run build
```

Deve terminar com uma linha `✓ built in ...`. Se aparecer erro, mande o print antes de seguir: o Cloudflare roda o mesmo comando e falharia do mesmo jeito.

## 1. Criar o projeto no Cloudflare

1. Entre em https://dash.cloudflare.com (crie a conta gratuita, se não tiver).
2. Menu lateral: **Compute (Workers)** → **Workers & Pages** → **Create** → aba **Pages** → **Import an existing Git repository** (ou "Connect to Git").
3. Conecte sua conta do GitHub e autorize o acesso ao repositório **SAASAGENDA**.
4. Escolha o repositório e clique em **Begin setup**.

## 2. Configurar o build

| Campo | Valor |
| --- | --- |
| Project name | `saasagenda` (vira o endereço `saasagenda.pages.dev`; escolha outro nome se estiver em uso) |
| Production branch | `main` |
| Framework preset | **Vite** (ou "None") |
| Build command | `npm run build` |
| Build output directory | `dist` |

Em **Environment variables (advanced)**, adicione:

| Nome | Valor |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://htbybolxkejjtroszzvg.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | a mesma chave **anon** do seu arquivo `.env` |

Use só a chave anon (pública). **Nunca** coloque a `service_role` aqui.

Clique em **Save and Deploy** e espere terminar (1 a 3 minutos).

## 3. Avisar o Supabase do novo endereço

Sem isso, login funciona, mas os links de recuperação de senha e de convite apontam para o localhost.

No Supabase: **Authentication → URL Configuration**

- **Site URL:** `https://saasagenda.pages.dev` (o endereço que o Cloudflare mostrar)
- **Redirect URLs:** adicione `https://saasagenda.pages.dev/redefinir-senha`

Mantenha também as entradas de `localhost`, para continuar testando no seu computador.

## 4. Testar

1. Abra `https://saasagenda.pages.dev/login` e entre como SuperAdmin.
2. Abra `https://saasagenda.pages.dev/agendar/gh-barber` no celular e faça um agendamento.
3. Recarregue a página dentro de `/painel/agenda`: deve continuar na mesma tela (se der "404", o `_redirects` não foi publicado).
4. Gere o **QR Code** de novo pelo painel no endereço novo: o QR feito em `localhost` só funciona no seu computador.

## Domínio próprio (opcional)

No projeto do Pages: **Custom domains → Set up a custom domain** e informe, por exemplo, `agenda.seudominio.com.br`. Se o domínio já estiver no Cloudflare, o DNS é criado sozinho; se não, o painel mostra o registro CNAME para criar no seu provedor.

Depois, troque o **Site URL** e o **Redirect URL** do Supabase para o domínio novo e gere os QR Codes de novo.

## Problemas comuns

| Sintoma | Causa provável |
| --- | --- |
| Build falha com erro de TypeScript | Rode `npm run build` no seu computador e mande o erro |
| Site abre, mas a tela de login avisa para configurar o `.env` | Variáveis `VITE_...` não cadastradas, ou cadastradas depois do build: em **Deployments**, clique em **Retry deployment** |
| 404 ao recarregar uma página interna | `public/_redirects` ausente no deploy |
| Link de recuperação de senha abre o localhost | Site URL / Redirect URLs do Supabase não atualizados |
