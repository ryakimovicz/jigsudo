document.addEventListener("DOMContentLoaded", () => {
  const body = document.body;
  const shrinkThreshold = 100;
  const expandThreshold = 50;

  const handleScroll = () => {
    const currentScrollY = window.scrollY;

    if (currentScrollY > shrinkThreshold) {
      if (!body.classList.contains("header-condensed")) {
        body.classList.add("header-condensed");
      }
    } else if (currentScrollY < expandThreshold) {
      if (body.classList.contains("header-condensed")) {
        body.classList.remove("header-condensed");
      }
    }
  };

  // Listen for scroll on window
  window.addEventListener("scroll", handleScroll, { passive: true });

  // Initial check
  handleScroll();
});
