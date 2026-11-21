# Segurança e políticas RLS

Todas as tabelas do schema `public` têm Row Level Security ativada. O frontend usa apenas a chave pública (anon); o que cada pessoa vê ou altera é decidido pelo banco. Os guards de rota do React servem só para navegação.

## Quem é quem para o banco

| Papel do Postgres | Quem é | Acesso |
| --- | --- | --- |
| `anon` | visitante da página pública | **Nenhuma tabela.** Apenas 6 funções RPC públicas |
| `authenticated` | usuário logado | linhas liberadas pelas políticas abaixo |
| `service_role` | Edge Functions | ignora RLS; usado só depois de a função autorizar quem chamou |

## Funções de autorização

Usadas dentro das políticas. São `SECURITY DEFINER` (leem `establishment_users` sem recursão) e `STABLE`.

| Função | Verdadeiro quando |
| --- | --- |
| `is_super_admin()` | `profiles.is_super_admin` do usuário logado |
| `is_member(est)` | membro **ativo** do estabelecimento, ou SuperAdmin |
| `has_role(est, papéis[])` | membro ativo com um dos papéis, ou SuperAdmin |
| `has_permission(est, perm)` | proprietário/admin; ou membro com a chave `perm` em `permissions`; ou SuperAdmin |
| `current_professional_id(est)` | devolve o profissional vinculado ao usuário (agenda própria) |
| `can_view_profile(user)` | o próprio usuário, SuperAdmin, ou quem gerencia usuários de um estabelecimento do alvo |
| `can_manage_assets(pasta)` | pode gravar imagens na pasta `<establishment_id>/` |

Chaves de permissão: `manage_appointments`, `manage_customers`, `manage_services`, `manage_professionals`, `manage_schedules`, `manage_theme`, `manage_settings`, `manage_users`, `view_reports`.
Padrão ao criar: recepcionista recebe `manage_appointments` e `manage_customers`; profissional não recebe nenhuma (só a própria agenda).

## Políticas por tabela

"Membro" = `is_member(establishment_id)`. "Perm X" = `has_permission(establishment_id, 'X')`.

| Tabela | Ler | Criar / alterar / excluir |
| --- | --- | --- |
| `profiles` | `can_view_profile(id)` | alterar: o próprio ou SuperAdmin. `is_super_admin` travado por trigger |
| `plans` | qualquer usuário logado | SuperAdmin |
| `establishments` | membro | criar/excluir: SuperAdmin. Alterar: perm `manage_settings`; `status` e `slug` só SuperAdmin (trigger) |
| `subscriptions` | membro | SuperAdmin |
| `establishment_users` | o próprio vínculo, ou perm `manage_users` | perm `manage_users`, **nunca** sobre o proprietário; papel `admin` só pelo proprietário. Vínculo de proprietário: só SuperAdmin |
| `professionals` | membro | perm `manage_professionals` |
| `services` | membro | perm `manage_services` |
| `professional_services` | membro | perm `manage_services` ou `manage_professionals` |
| `customers` | perm `manage_customers` ou `manage_appointments`; profissional só vê clientes com agendamento dele | criar/alterar: as mesmas perms. Excluir: `manage_customers` |
| `appointments` | perm `manage_appointments`, ou agendamentos do próprio profissional | idem; criação só com `source = 'admin'`. **Sem exclusão** (cancela-se, não se apaga) |
| `business_hours` | membro | perm `manage_schedules` |
| `professional_schedules` | membro | perm `manage_schedules`, ou o próprio profissional |
| `blocked_times` | membro | perm `manage_schedules`, ou o próprio profissional (só bloqueios dele) |
| `establishment_themes` | membro | perm `manage_theme` (e recurso `custom_theme` do plano, por trigger) |
| `customer_plans` | membro | perm `manage_services` (o visitante vê só os ativos, via `get_public_establishment`) |
| `notifications` | perm `manage_appointments` | somente backend |
| `audit_logs` | SuperAdmin (tudo); proprietário/admin (do próprio estabelecimento) | somente triggers |
| `platform_settings` | SuperAdmin | SuperAdmin |
| `storage.objects` (bucket `establishment-assets`) | leitura pública por URL | gravar só em `<establishment_id>/…` com `can_manage_assets` |

## Página pública: só funções RPC

O visitante não consulta tabelas. Estas funções (`SECURITY DEFINER`) devolvem apenas dados públicos e validam tudo no servidor:

| Função | O que faz | Proteções |
| --- | --- | --- |
| `get_public_establishment(slug)` | dados, tema, serviços e profissionais | só estabelecimento **ativo**; sem telefone/e-mail de profissionais; sem clientes |
| `get_available_slots(slug, serviço, data, profissional?)` | horários livres | calculados no banco; respeita antecedência mínima/máxima |
| `create_public_appointment(...)` | cria o agendamento | valida nome/telefone; trava por estabelecimento; exige que o horário esteja na lista de livres; limite de reservas em aberto por telefone; restrição anti-sobreposição |
| `get_public_appointment(token)` | consulta um agendamento | exige o código secreto de 32 caracteres daquele agendamento |
| `cancel_public_appointment(token)` | cancela | respeita o prazo mínimo configurado |
| `reschedule_public_appointment(token, novo horário)` | reagenda | mesmo prazo + nova validação de disponibilidade |

**Clientes só acessam os próprios agendamentos:** não existe listagem por telefone ou nome. Cada agendamento tem um código aleatório (`public_token`) entregue a quem agendou; sem ele, nada é devolvido.

## Pré-visualização da Personalização

A rota `/preview/:establishmentId` (aberta em um iframe no painel) monta a página pública a partir das tabelas com a sessão do usuário logado, portanto vale a RLS normal: só funciona para membros do estabelecimento. As alterações ainda não salvas chegam por `postMessage`, aceito apenas da mesma origem. Nada é gravado pela prévia (o botão de confirmar fica desativado).

## Regras garantidas por trigger (valem para qualquer caminho de escrita)

- Agendamento só entra se o estabelecimento estiver **ativo** e o horário passar em `appointment_conflict_reason` (funcionamento, expediente, intervalo, bloqueios, ocupação).
- `ends_at`, `occupied_until` e preço são calculados pelo banco a partir do serviço; `public_token`, `source`, `establishment_id` são imutáveis.
- Limites do plano: profissionais ativos, usuários ativos, agendamentos por mês, personalização visual.
- Auditoria: inserções, alterações e exclusões em `plans`, `establishments`, `subscriptions`, `establishment_users`, `professionals`, `services`, `appointments`, `blocked_times` e `establishment_themes` vão para `audit_logs` com autor, antes e depois.

## Edge Functions

| Função | Quem pode chamar | Verificação |
| --- | --- | --- |
| `admin-create-establishment` | SuperAdmin | confere `is_super_admin` no banco; a função SQL `admin_provision_establishment` confere de novo |
| `create-staff-user` | quem tem `manage_users` no estabelecimento | `has_permission` avaliado com o token de quem chamou; `admin` só pelo proprietário |
| `admin-manage-user` | SuperAdmin; ou `manage_users` sobre membro não-proprietário de vínculo único | nunca altera SuperAdmin nem a própria conta |

As funções SQL `admin_provision_establishment` e `admin_add_member` só podem ser executadas pelo `service_role`.

## Limitações conhecidas

- **Abuso da página pública:** há limite de reservas em aberto por telefone, mas não há CAPTCHA nem limite por IP. Recomenda-se adicionar antes de divulgar amplamente.
- **Telefone não é verificado:** qualquer pessoa pode agendar informando um telefone. Verificação por código depende da integração de mensagens.
- **Quem tem `manage_users`** pode conceder a outros (e a si) qualquer permissão fina, exceto os papéis de proprietário e administrador. Conceda essa permissão apenas a pessoas de confiança.
- **Estabelecimento sem plano** funciona sem limites, por decisão de projeto.
