# LhamaTree: como rodar fora do claude.ai

O app é um arquivo só (`raizes-sims-page.html`). Fora do claude.ai, as fotos e os álbuns ficam guardados **no navegador** de quem usa (IndexedDB), e a conta fica no localStorage. Nada vai para um servidor.

## 1. Publicar no GitHub Pages (grátis)

1. Envie estes arquivos para o repositório no GitHub (`index.html`, `raizes-sims-page.html` e este `LEIA-ME.md`).
2. No GitHub: **Settings > Pages**.
3. Em **Build and deployment**, escolha **Deploy from a branch**, a branch (`main` ou a que você usar) e a pasta **/ (root)**. Salve.
4. Em alguns minutos o site abre em `https://SEU-USUARIO.github.io/thesims/`.

Netlify, Vercel e Cloudflare Pages também servem: é só apontar para esta pasta.

## 2. Ligar o login com o Google

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/) e crie um projeto.
2. Vá em **APIs e serviços > Tela de permissão OAuth**. Escolha **Externo**, preencha o nome do app e o seu e-mail. Use só os escopos básicos (e-mail e perfil).
3. Enquanto o app estiver em modo **Teste**, só os e-mails cadastrados em **Usuários de teste** conseguem entrar. Para liberar para qualquer pessoa, use **Publicar app**.
4. Vá em **Credenciais > Criar credenciais > ID do cliente OAuth** e escolha **Aplicativo da Web**.
5. Em **Origens JavaScript autorizadas**, coloque o endereço do site, por exemplo `https://SEU-USUARIO.github.io` (sem barra no final e sem `/thesims`). Para testar no seu computador, adicione também `http://localhost:5177` ou a porta que você usar.
6. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`). Ele é público, não é um segredo.
7. Abra `raizes-sims-page.html`, procure por `const GOOGLE_CLIENT_ID=''` e cole o ID entre as aspas. Envie o arquivo de novo.

Enquanto o ID estiver vazio, o botão do Google só avisa que falta configurar.

## Limites importantes

- O login com o Google lê nome e e-mail no navegador, **sem verificar a assinatura em um servidor**. Serve para uso pessoal. Para impedir que alguém se passe por outra pessoa, é preciso um servidor.
- As fotos ficam só no aparelho e no navegador onde foram adicionadas. Para levar os dados para outro lugar, use **Minha conta > Dados e privacidade > Baixar cópia** e depois **Restaurar de uma cópia**.
- O plano Free limita a galeria a 50 fotos, mas esse limite só é aplicado no navegador.
