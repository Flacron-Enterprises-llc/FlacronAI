import { useEffect } from 'react';

const SITE_URL = 'https://flacronai.com';
const SITE_NAME = 'FlacronAI';
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

// Upsert a <meta> tag identified by `attr`="key" and set its content.
const setMeta = (attr, key, content) => {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
};

const setLink = (rel, href) => {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
};

/**
 * Per-page SEO tags for the SPA (T-1.12). Mount once per page:
 *   <Seo title="Pricing — FlacronAI" description="…" path="/pricing" />
 * `path` builds the canonical URL; pass `noindex` for auth/app/404 pages.
 */
export default function Seo({ title, description, path = '/', noindex = false }) {
  useEffect(() => {
    document.title = title;
    const url = `${SITE_URL}${path}`;

    setMeta('name', 'description', description);
    setMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');
    setLink('canonical', url);

    setMeta('property', 'og:site_name', SITE_NAME);
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:image', DEFAULT_OG_IMAGE);

    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'twitter:image', DEFAULT_OG_IMAGE);
  }, [title, description, path, noindex]);

  return null;
}
