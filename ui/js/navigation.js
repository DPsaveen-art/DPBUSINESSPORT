document.addEventListener("DOMContentLoaded", () => {
  const links = document.querySelectorAll(".sidebar nav a");
  const pages = document.querySelectorAll(".page");
  const title = document.getElementById("page-title");

  function showPage(pageId, pageTitle) {
    // Hide all pages
    pages.forEach((page) => {
      page.classList.remove("active");
    });

    // Show selected page
    const selectedPage = document.getElementById(pageId);
    if (selectedPage) {
      selectedPage.classList.add("active");
    }

    // Update title
    title.textContent = pageTitle;
  }

  // Attach click handlers
  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const pageId = link.dataset.page;
      showPage(pageId, link.textContent);
    });
  });

  // Ensure ONLY dashboard is visible on first load
  showPage("dashboard", "Dashboard");
});
