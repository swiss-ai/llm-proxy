const SITE_CONFIG = {
  // Navigation pages
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
  // External links
  external: {
    github: "https://github.com/swiss-ai/modelServing",
    swiss_ai: "https://www.swiss-ai.org/",
    eth: "https://ethz.ch/en.html",
    epfl: "https://www.epfl.ch/en/"
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
