# Imagens locais

Esta pasta existe para receber as imagens definitivas do portal.

Na versão de demonstração, as imagens vêm de URLs públicas do Unsplash
(configuradas em `next.config.ts`). Para usar arquivos locais:

1. Coloque os arquivos aqui, por exemplo `public/images/capa-edicao.jpg`.
2. Nos arquivos de `data/*.ts`, troque a URL completa pelo caminho relativo:
   `image: "/images/capa-edicao.jpg"`.
3. Se nenhuma imagem externa restar, o bloco `images.remotePatterns`
   do `next.config.ts` pode ser removido.

O logo textual do header pode ser substituído por `public/images/logo.svg`
(ver comentário em `components/layout/Header.tsx`).
