const SITE_CONFIG = {
  pages: {
    home: "/",
    api_key: "/api_key",
    chat: "/chat",
    login: "/login",
    news: "/news",
    blog: "/blog",
    usage: "/usage",
    about: "/about",
  },
};

// Helper function to get URLs
function getUrl(type, name) {
  if (SITE_CONFIG[type] && SITE_CONFIG[type][name]) {
    return SITE_CONFIG[type][name];
  }
  console.warn(`URL not found: ${type}.${name}`);
  return "/";
}
