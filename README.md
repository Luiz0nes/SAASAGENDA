# SaaS Agenda — plataforma de agendamento multi-estabelecimento

Uma única aplicação e um único banco de dados para barbearias, salões, clínicas, consultórios e profissionais autônomos. Cada estabelecimento tem painel, equipe, agenda e página pública próprios, com isolamento de dados garantido pelo banco (Row Level Security).

- **Frontend:** React + TypeScript + Tailwind CSS (Vite)
- **Backend:** Supabase — Auth, PostgreSQL, Storage, RLS e Edge Functions

## Como começar

1. Siga **[docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)** para criar o projeto Supabase, aplicar as migrations, publicar as Edge Functions e criar o primeiro SuperAdmin.
2. Configure o frontend:

   ```bash
   cp .env.example .env      # preencha URL e chave anon do seu projeto
   npm install
   npm run dev
   ```

3. Entre em `/login` com o SuperAdmin, crie um plano (opcional) e o primeiro estabelecimento. O proprietário recebe o acesso e configura serviços, profissionais e horários. A página pública fica em `/agendar/<slug>`.

## Papéis

| Papel | O que faz |
| --- | --- |
| **SuperAdmin** | Dono da plataforma. Único que cadastra estabelecimentos e proprietários, define planos, suspende/reativa. |
| **Proprietário** | Administra o próprio estabelecimento. Não enxerga nenhum outro. |
| **Administrador** | Mesmo acesso do proprietário, exceto mexer no vínculo do proprietário. |
| **Recepcionista** | Clientes e agendamentos (permissões ajustáveis). |
| **Profissional** | Somente a própria agenda e disponibilidade. |
| **Cliente (visitante)** | Agenda pela página pública e consulta/cancela/reagenda pelo link secreto do agendamento. |

## Estrutura do projeto

```
supabase/
  migrations/
    …01_schema.sql               tabelas, chaves, índices, restrição anti-conflito
    …02_functions_triggers.sql   autorização, disponibilidade, limites de plano, auditoria
    …03_rls.sql                  políticas de Row Level Security
    …04_api.sql                  funções RPC (página pública, painéis, provisionamento)
    …05_storage.sql              bucket de imagens e suas políticas
    …06_theme_customization.sql  temas, fontes, estilo, galeria e modo escuro
    …07_hero_animation.sql       estilo de animação do topo da página pública
    …08_instagram.sql            Instagram do estabelecimento
    …09_service_promotions.sql   preço original (promoção) dos serviços
    …10_customer_plans.sql       vitrine de planos mensais para os clientes
    …11_realtime_appointments.sql agendamentos no Supabase Realtime
  functions/
    admin-create-establishment/  SuperAdmin cria estabelecimento + proprietário
    create-staff-user/           proprietário cria contas da equipe
    admin-manage-user/           redefinir senha / bloquear acesso
    _shared/                     CORS, autenticação do chamador, validações
src/
  lib/           cliente Supabase, formatação, datas com fuso, useLoad,
                 theme.ts (motor de temas e modo escuro), qrcode.ts (gerador de QR)
  types/         tipos das tabelas e das respostas RPC
  components/    UI reutilizável (botões, modal, toast, SlotPicker, layout dos painéis)
  modules/
    auth/           sessão, guards de rota, login, recuperação e definição de senha
    superadmin/     visão geral, estabelecimentos, planos
    establishment/  início, agenda, clientes, serviços, profissionais, horários,
                    personalização, QR Code, configurações
    public/         página inicial, página pública do estabelecimento (BookingView),
                    pré-visualização (/preview/:id), consulta/cancelamento/reagendamento
    theme/          temas prontos, editor de personalização e moldura da prévia
docs/
  SUPABASE_SETUP.md   passo a passo de instalação
  RLS.md              políticas de segurança, tabela por tabela
```

## Como o agendamento evita conflitos

1. **Uma única função decide se um horário está livre** (`private.appointment_conflict_reason`): funcionamento do estabelecimento, expediente e intervalo do profissional, bloqueios/folgas e outros agendamentos (incluindo o intervalo após o serviço).
2. A **lista de horários** mostrada ao cliente e ao painel usa essa função.
3. Uma **trigger** usa a mesma função em toda gravação de agendamento — pela página pública, pelo painel ou por SQL.
4. Uma **restrição de exclusão** (`appointments_no_overlap`) faz o PostgreSQL recusar dois agendamentos ativos sobrepostos do mesmo profissional, mesmo em requisições simultâneas.

O navegador nunca calcula disponibilidade nem grava horários diretamente pela página pública.

## O que já está implementado

- Banco completo (16 tabelas da especificação + `platform_settings`), RLS em todas as tabelas, auditoria por trigger, limites de plano aplicados no banco.
- Edge Functions de criação de proprietários e equipe (a Service Role Key fica só no servidor).
- Autenticação: login, recuperação de senha, definição de senha por convite.
- **SuperAdmin:** visão geral, estabelecimentos (criar, editar, suspender, atribuir plano), planos (CRUD).
- **Estabelecimento:** início com indicadores, agenda diária com filtros (confirmar, concluir, falta, cancelar, reagendar, trocar profissional, observações, novo agendamento), clientes, serviços, profissionais com agenda semanal, funcionamento e bloqueios, configurações e regras.
- **Personalização:** 14 temas prontos por segmento (barbearia, salão, clínica, odontologia, estética, autônomo), cores do modo claro e do escuro, 18 fontes, 4 layouts de cabeçalho, cantos, botões, cartões, galeria de até 12 fotos e textos, com pré-visualização ao vivo no celular e no computador.
- **Topo animado:** entrada do logotipo, nome e frase; capa com zoom lento; no modo Dinâmico também brilho, parallax ao rolar e faixa listrada em movimento. Escolha em Personalização → Estilo (Sem animação, Suave ou Dinâmica); respeita o “reduzir movimento” do celular.
- **Promoções e planos mensais:** serviço com preço “de” riscado e selo Promoção; vitrine de planos de assinatura (preços mensais, benefícios, texto “Como funciona”) com o botão “Quero assinar” pelo WhatsApp. Sem cobrança nem controle de sessões.
- **Agenda em tempo real:** novo agendamento pela página aparece sozinho no painel (aviso, som curto, selo “Novo”, contadores dos dias), via Supabase Realtime respeitando a RLS; atualização de reserva a cada minuto e ao voltar para a aba.
- **Modo escuro:** botão para o cliente alternar na página pública (pode ser desligado), modo inicial claro/escuro/automático e paleta escura própria.
- **QR Code:** QR do link de agendamento (gerador próprio, sem dependência), com cor e logotipo no centro, download em PNG e SVG e cartaz A4 pronto para imprimir.
- **Público:** página do estabelecimento com o tema dele, fluxo de agendamento em etapas, galeria, equipe, consulta, cancelamento e reagendamento, links de WhatsApp.

## Próximas etapas (backend já preparado)

| Etapa | Situação do backend |
| --- | --- |
| Tela **Usuários e permissões** | Edge Functions `create-staff-user` e `admin-manage-user` prontas; RLS pronta |
| Calendário **semanal e mensal** | Mesma consulta da agenda diária, com intervalo maior |
| Página de **Relatórios** com filtros por profissional e serviço | `get_establishment_dashboard` já aceita esses filtros |
| Telas de **logs de auditoria**, **assinaturas** e **configurações globais** | Tabelas `audit_logs`, `subscriptions`, `platform_settings` e políticas prontas |
| **WhatsApp Business API** (lembretes automáticos) | Tabela `notifications` reservada; nada é enviado sem a integração |
| **Gateway de pagamento** | `subscriptions.external_reference` reservado; nenhuma cobrança é simulada |

## Scripts

| Comando | Função |
| --- | --- |
| `npm run dev` | servidor de desenvolvimento |
| `npm run typecheck` | checagem de tipos |
| `npm run build` | checagem de tipos + build de produção em `dist/` |

Hospedagem: o passo a passo do Cloudflare Pages está em **[docs/DEPLOY_CLOUDFLARE.md](docs/DEPLOY_CLOUDFLARE.md)**. Funciona em qualquer serviço de site estático: `wrangler.jsonc` (Cloudflare) e `vercel.json` (Vercel) já direcionam todas as rotas para `index.html`, e `public/_headers` define cabeçalhos de segurança e cache.
