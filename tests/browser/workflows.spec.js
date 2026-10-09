import { test, expect } from "@playwright/test";
async function login(page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("office@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser-test-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
}
async function noOverflow(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBeTruthy();
}
for (const width of [320, 390, 820, 1440])
  test(`public routes, modal keyboard and office layouts at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const route of [
      "/",
      "/about/",
      "/services/",
      "/service/driveways/",
      "/projects/",
      "/portfolio/luxury-residential-driveway/",
      "/team/",
    ]) {
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
      await noOverflow(page);
    }
    await page.goto("/");
    if (width <= 768) {
      await page
        .getByRole("button", { name: "Open menu", exact: true })
        .click();
      await expect(
        page.getByRole("navigation", {
          name: "Mobile navigation",
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Get Quote", exact: true })
        .click();
      await expect(
        page.getByRole("navigation", {
          name: "Mobile navigation",
          exact: true,
        }),
      ).toHaveCount(0);
    } else await page.locator(".hero .quote-trigger").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByLabel("First Name")).toBeFocused();
    await noOverflow(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator(".hero .quote-trigger").click();
    await page.getByLabel("First Name").fill("Synthetic");
    await page.getByLabel("Last Name").fill(`Browser ${width}`);
    await page
      .getByLabel("Email Address", { exact: true })
      .fill(`browser${width}@example.test`);
    await page
      .getByLabel("Service Needed (Optional)", { exact: true })
      .selectOption("driveways");
    await page
      .getByLabel("Project Details")
      .fill("Synthetic driveway enquiry for browser verification.");
    await page.getByRole("button", { name: "Submit Request" }).click();
    await expect(
      page.getByRole("heading", { name: "Thank you. Your enquiry is saved." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.screenshot({
      path: `test-results/public-${width}.png`,
      fullPage: true,
    });
    await page.goto("/office");
    await expect(page).toHaveURL(/\/login$/);
    await login(page);
    for (const route of [
      "/office",
      "/office/pipeline",
      "/office/leads",
      "/office/contacts",
      "/office/sites",
      "/office/quotes",
      "/office/followups",
      "/office/marketing",
      "/office/activity",
      "/office/leads/new",
    ]) {
      await page.goto(route);
      await expect(page.locator("main h1")).toBeVisible();
      await noOverflow(page);
    }
    await page.goto("/office");
    await page.screenshot({
      path: `test-results/office-${width}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
test("office enquiry → contact → site → quote → issued snapshot → revision → consent", async ({
  page,
}) => {
  await page.request.post("/api/enquiries", {
    headers: { Origin: "http://localhost:3101" },
    data: {
      first_name: "Synthetic",
      last_name: "Workflow",
      email: "workflow@example.test",
      service: "driveways",
      message: "Synthetic independent workflow enquiry.",
    },
  });
  await login(page);
  await page.goto("/office/leads");
  await page
    .getByRole("link", { name: "Synthetic Workflow", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Create / link contact by email",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Contact linked", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Follow-up date", { exact: true }).fill("2020-01-01");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Changes saved.", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Complete follow-up", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByLabel("Follow-up date", { exact: true })).toHaveValue(
    "",
  );
  const leadURL = page.url();
  await page.goto("/office/sites/new");
  await page
    .getByLabel("Name / reference", { exact: true })
    .fill("Synthetic driveway site");
  await page.getByLabel("Contact", { exact: true }).selectOption({
    label: await page
      .getByLabel("Contact", { exact: true })
      .locator("option")
      .filter({ hasText: "Synthetic Workflow" })
      .textContent(),
  });
  await page
    .getByLabel("Site address", { exact: true })
    .fill("Synthetic address, Perth");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(/\/office\/sites\/\d+$/);
  await page.goto(leadURL);
  await page.getByLabel("Site", { exact: true }).selectOption({
    label: await page
      .getByLabel("Site", { exact: true })
      .locator("option")
      .filter({ hasText: "Synthetic driveway site" })
      .textContent(),
  });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Changes saved.", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Prepare quote", exact: true })
    .click();
  await expect(page).toHaveURL(/\/office\/quotes\/\d+$/);
  await page.getByLabel("Total (AUD)", { exact: true }).fill("4500.50");
  await page
    .getByLabel("Scope", { exact: true })
    .fill("Supply and pour driveway");
  await page.getByLabel("Exclusions", { exact: true }).fill("Excavation");
  await page
    .getByLabel("Staff-recorded status", { exact: true })
    .selectOption("sent");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByLabel("Total (AUD)", { exact: true })).toBeDisabled();
  await expect(
    page.getByText("Revision 1 · AUD 4500.50", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create next revision", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByLabel("Total (AUD)", { exact: true })).toBeEnabled();
  await page.getByLabel("Total (AUD)", { exact: true }).fill("5000");
  await page
    .getByLabel("Staff-recorded status", { exact: true })
    .selectOption("sent");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("Revision 2 · AUD 5000.00", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Revision 1 · AUD 4500.50", { exact: true }),
  ).toBeVisible();
  await page.goto("/office/contacts");
  await page
    .getByRole("link", { name: "Synthetic Workflow", exact: true })
    .click();
  await page
    .getByLabel("Tags (comma separated)", { exact: true })
    .fill("builders");
  await page
    .getByLabel("Permission", { exact: true })
    .selectOption("subscribed");
  await page
    .getByLabel("Permission evidence, including source and date", {
      exact: true,
    })
    .fill("Synthetic written opt-in on 2026-10-06");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Changes saved.", { exact: true })).toBeVisible();
  await page.goto("/office/marketing");
  await expect(
    page.getByRole("heading", { name: "1 eligible email addresses" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Synthetic Workflow", exact: true }),
  ).toBeVisible();
});
