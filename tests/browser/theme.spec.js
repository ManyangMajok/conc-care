import { test, expect } from "@playwright/test";

test("Public website navigation, carousel, FAQs, filters and contact controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator(".hero h1")).toHaveText(
    "STRONG FOUNDATIONSA BRIGHTER TOMORROW",
  );
  await expect(page.locator(".hero")).toHaveCSS("display", "flex");
  await expect(page.locator(".services-grid .service-card")).toHaveCount(6);
  await expect(page.locator(".services-grid .service-card img")).toHaveCount(0);
  await expect(
    page.locator(".services-grid .service-card").first(),
  ).toContainText("Alfresco Areas");
  await expect(page.locator(".navbar")).not.toHaveClass(/scrolled/);
  await page.locator(".testimonials").scrollIntoViewIfNeeded();
  await expect(page.locator(".navbar")).toHaveClass(/scrolled/);
  await expect(page.locator(".navbar .logo-for-light")).toBeVisible();
  await page.locator(".testimonial-cards").hover();
  const first = await page.locator(".front-card h4").textContent();
  await page.getByRole("button", { name: "Next testimonial" }).click();
  await expect(page.locator(".front-card h4")).not.toHaveText(first);
  await page.getByRole("button", { name: "Previous testimonial" }).click();
  await expect(page.locator(".front-card h4")).toHaveText(first);
  const cure = page.getByRole("button", {
    name: "How long does concrete take to cure?",
  });
  await cure.click();
  await expect(cure).toHaveAttribute("aria-expanded", "true");
  const estimate = page.getByRole("button", {
    name: "Do you offer free estimates?",
  });
  await estimate.focus();
  await page.keyboard.press("Enter");
  await expect(estimate).toHaveAttribute("aria-expanded", "true");
  await expect(cure).toHaveAttribute("aria-expanded", "false");
  await page.locator(".news-main").scrollIntoViewIfNeeded();
  const cardBounds = await page.locator(".news-main").boundingBox();
  const captionBounds = await page.locator(".news-main .news-content").boundingBox();
  expect(captionBounds.y + captionBounds.height).toBeLessThanOrEqual(
    cardBounds.y + cardBounds.height + 1,
  );
  await page.getByRole("button", { name: "Open contact options" }).click();
  await expect(
    page.getByRole("link", { name: "Call Us", exact: true }),
  ).toBeVisible();
  await page.locator('.fc-menu-item[aria-label="Get Quote"]').click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("First Name")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open contact options" }),
  ).toBeFocused();
  await page.goto("/projects/");
  await expect(page.locator(".blog-card:not(.hidden)")).toHaveCount(6);
  await page.getByRole("button", { name: "commercial", exact: true }).click();
  await expect(page.locator(".blog-card:not(.hidden)")).toHaveCount(2);
  await page.getByRole("button", { name: "residential", exact: true }).click();
  await expect(page.locator(".blog-card:not(.hidden)")).toHaveCount(2);
  await page.getByRole("button", { name: "All Projects", exact: true }).click();
  await expect(page.locator(".blog-card:not(.hidden)")).toHaveCount(6);
  await page.goto("/portfolio/luxury-residential-driveway/");
  await expect(page.locator(".navbar .logo-for-light")).toBeVisible();
  await page.goto("/service/driveways/");
  await page.locator(".service-quote-box .quote-trigger").click();
  await expect(page.getByLabel("Service Needed (Optional)")).toHaveValue(
    "driveways",
  );
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Open menu" });
  await menu.click();
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await menu.click();
  await page.getByRole("button", { name: "Get Quote", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("First Name")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
});
