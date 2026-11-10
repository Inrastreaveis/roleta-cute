# Roleta Cute — GitHub Pages + Supabase

Esta versão publica o site estático no **GitHub Pages** e usa o **Supabase** somente para banco de dados, autenticação, armazenamento de imagens/músicas e sincronização em tempo real. Não usa Railway nem servidor Node.js.

## 1. Configuração do Supabase

O arquivo `js/supabase-config.js` já contém a URL do projeto e a chave **publishable** fornecida para este projeto. A publishable key foi projetada para aparecer no navegador; nunca coloque neste arquivo uma `service_role`, `secret key` ou senha do banco.

1. Abra o projeto Supabase `Roleta-Cute` (região South America / São Paulo).
2. Entre em **SQL Editor**.
3. Clique em **New query**.
4. Abra `supabase/schema.sql`, copie todo o conteúdo e cole no SQL Editor.
5. Clique em **Run** e aguarde a mensagem de sucesso.

O SQL cria tabelas, funções protegidas, políticas RLS, bucket público para arquivos e habilita Realtime nas tabelas necessárias. Execute-o uma vez. Se executar novamente, as políticas e funções são recriadas com segurança, sem apagar os dados.

## 2. Configurar autenticação

No Supabase:

1. Vá em **Authentication → Providers → Email** e deixe Email habilitado.
2. Em **Authentication → URL Configuration**, configure depois de publicar:
   - **Site URL:** `https://SEU-USUARIO.github.io/roleta-cute/`
   - **Redirect URLs:** adicione também `https://SEU-USUARIO.github.io/roleta-cute/**`
3. Se a confirmação de e-mail estiver ligada, a primeira pessoa deverá confirmar o e-mail antes de entrar. Isso é recomendado para contas administrativas.

A primeira conta criada em `login.html` será automaticamente a **proprietária**. As contas seguintes ficam como `pending` até a proprietária autorizar.

### Autorizar outra pessoa

1. A pessoa escolhida abre `login.html` e clica em **Criar uma conta autorizada**.
2. Ela cria a conta com o próprio e-mail e senha e confirma o e-mail, se solicitado.
3. A proprietária entra em `admin.html` → **Permissões**.
4. Digita o mesmo e-mail e escolhe Moderador ou Administrador.

Moderador pode adicionar/remover participantes. Administrador pode gerenciar participantes, sorteios, links e aparência. Só a proprietária gerencia permissões.

## 3. Publicar no GitHub Pages

1. Crie um repositório chamado `roleta-cute` no GitHub.
2. Extraia este ZIP.
3. Envie para a raiz do repositório os arquivos `index.html`, `login.html`, `admin.html`, `css/`, `js/`, `supabase/`, `.nojekyll` e `README.md`.
4. No GitHub, abra **Settings → Pages**.
5. Em **Build and deployment**, selecione **Deploy from a branch**.
6. Escolha a branch `main` e a pasta `/(root)`; clique em **Save**.
7. Aguarde o GitHub publicar e abra o endereço informado na página Pages.
8. Volte ao Supabase e configure o Site URL/Redirect URLs com o endereço exato do GitHub Pages.

## 4. Endereços do site

Depois de publicado, os endereços serão:

- Página pública: `https://SEU-USUARIO.github.io/roleta-cute/`
- Login e primeiro acesso: `https://SEU-USUARIO.github.io/roleta-cute/login.html`
- Painel: `https://SEU-USUARIO.github.io/roleta-cute/admin.html`

## 5. Recursos incluídos

- Roleta pastel com uma fatia por participante e animação de sorteio.
- Cadastro público de uma inscrição por navegador/dispositivo (identificador persistido no navegador e validado no banco).
- Lista pública sincronizada em tempo real.
- Sorteio de vários ganhadores sem repetição dentro do mesmo sorteio.
- Refazer um ganhador e propagar a animação para os visitantes conectados.
- Painel administrativo com permissões owner/admin/moderator.
- Links editáveis, Live Pix e ícones/emoji.
- Personalização de título, subtítulo, tema e fundo por URL ou upload.
- Upload de música e controle de reprodução.
- Histórico de sorteios.

## 6. Limites importantes

- O GitHub Pages hospeda os arquivos do site. O Supabase é necessário para login, dados compartilhados, realtime e arquivos enviados pelo painel.
- O bloqueio por dispositivo usa um identificador guardado no armazenamento do navegador. Apagar os dados do site, usar outro navegador ou outro dispositivo permite criar outro identificador. Não equivale a uma verificação de identidade.
- A música só começa depois de uma interação do visitante, pois navegadores bloqueiam autoplay em muitos casos.
- O nome dos participantes e os links ativos são públicos; nunca armazene dados pessoais sensíveis na lista.
- A chave `sb_publishable_...` é pública. A proteção das operações administrativas depende das políticas RLS e funções do SQL incluído. Não publique uma chave `service_role`/`secret`.

## 7. Testar antes de publicar

Abra a pasta em um servidor estático local (por exemplo, Live Server no VS Code). Não use `npm start`: esta versão não possui servidor Node.js.
