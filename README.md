# Trilha — Gestão Pessoal de Tarefas

Um SPA (HTML + CSS + JavaScript puro) para controlar tarefas diárias (hábitos) e de longo prazo, com Supabase como back-end e pronto para hospedar no GitHub Pages.

## Estrutura de arquivos

```
trilha/
├── index.html          # shell da aplicação
├── styles.css           # identidade visual ("Trilha")
├── app.js               # toda a lógica (auth, CRUD, telas)
├── config.example.js    # modelo de configuração do Supabase
└── schema.sql           # script SQL para criar as tabelas no Supabase
```

## 1. Criar o projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um novo projeto (gratuito).
2. No painel, vá em **SQL Editor** → **New query**, cole todo o conteúdo de `schema.sql` e clique em **Run**.
   Isso cria as tabelas `tasks`, `subtasks`, `daily_tasks`, `daily_task_logs`, `user_settings`, já com Row Level Security habilitado (cada usuário só vê os próprios dados).
3. Vá em **Authentication → Providers** e confirme que **Email** está habilitado (é o padrão).
   - Se quiser pular a confirmação por e-mail durante os testes, desative "Confirm email" em **Authentication → Settings**.
4. Vá em **Project Settings → API** e copie:
   - **Project URL**
   - **anon public key**

## 2. Configurar o front-end

1. Duplique `config.example.js` e renomeie a cópia para `config.js`.
2. Edite `config.js` com os valores copiados:

```js
const SUPABASE_URL = 'https://xxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

3. **Importante:** `config.js` contém apenas a chave pública (`anon key`), que é segura para expor — a segurança real vem do RLS do banco. Nunca coloque a `service_role key` aqui.

## 3. Testar localmente

Como o navegador bloqueia `fetch` em arquivos abertos diretamente (`file://`), sirva a pasta com um servidor simples:

```bash
cd trilha
python3 -m http.server 8080
```

Abra `http://localhost:8080` no navegador.

## 4. Publicar no GitHub Pages

1. Crie um repositório no GitHub e envie todos os arquivos da pasta `trilha/` (incluindo o `config.js` que você criou — como ele só tem a chave pública, não há problema em versionar).
2. No repositório, vá em **Settings → Pages**.
3. Em **Source**, selecione a branch `main` (ou `master`) e a pasta `/ (root)`.
4. Salve. Em alguns minutos o site estará disponível em `https://seu-usuario.github.io/seu-repositorio/`.

## 5. Como o sistema funciona

- **Login/Cadastro**: tela de autenticação por e-mail e senha via Supabase Auth.
- **Painel**: mostra a "trilha" do dia (hábitos diários como marcadores, com sequência/streak), os próximos prazos e um gráfico simples de produtividade dos últimos 7 dias.
- **Tarefas**: lista completa de tarefas de longo prazo, com filtros por status, prioridade e busca. Cada tarefa pode ter subtarefas arrastáveis para reordenar; o progresso pode ser manual (slider) ou automático (calculado pelas subtarefas concluídas).
- **Configurações**: nome de exibição, tema claro/escuro (salvo no banco e espelhado no `localStorage` para não piscar ao recarregar) e exportação de dados em JSON.

## 6. Próximos passos sugeridos (não incluídos nesta versão)

- Notificações do navegador para tarefas com prazo no dia.
- Service worker para uso offline.
- Lembretes por e-mail via Supabase Edge Functions.
- Visualização em calendário dos prazos.

Essas ideias estão descritas no documento de especificação original e podem ser adicionadas incrementalmente sobre esta base.
