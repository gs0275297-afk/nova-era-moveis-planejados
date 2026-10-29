// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Domínio definitivo do site. Defina SITE_URL no ambiente de deploy
// (ex.: SITE_URL=https://www.exemplo.com.br). Enquanto não houver domínio,
// canonical, URLs absolutas do Open Graph e sitemap ficam desligados.
const SITE_URL = process.env.SITE_URL;

export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'never',
  build: { format: 'directory' },
  integrations: SITE_URL ? [sitemap()] : [],
});
