import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

test("[QA-03] [DEMO-04] [UI-05] [UI-08] demo flow: pick a sample, approve every field, get the record", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("server-mode")).toContainText("Demo mode");
  await expectNoHorizontalScroll(page);

  await page.getByRole("button", { name: /Hindi/ }).click();
  await expect(page.getByRole("heading", { name: "3. Review each field" })).toBeVisible();
  await expect(page.getByTestId("notices")).toContainText("Recorded example");
  await expectNoHorizontalScroll(page);

  const approve = page.getByRole("button", { name: /^Approve / });
  await expect(approve).toHaveCount(9);
  while ((await approve.count()) > 0) await approve.first().click();

  const final = page.getByTestId("final-record");
  await expect(final).toBeVisible();
  await expect(final.getByRole("article", { name: "Printable view" })).toContainText(
    "Meldung eines Vorfalls am Arbeitsplatz",
  );
  const json = JSON.parse((await page.getByTestId("final-json").textContent()) ?? "{}");
  expect(json.format).toBe("talk-to-form/incident-report");
  expect(json.fields.injuries.value).toEqual([]);
  await expectNoHorizontalScroll(page);
});

test("[UI-07] [QA-03] the whole review can be done with the keyboard", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Turkish/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "3. Review each field" })).toBeVisible();
  // The Turkish recording replays an invalid first answer; the repaired date is shown.
  await expect(page.getByRole("article", { name: "Datum" })).toContainText("2026-11-17");

  await page.getByRole("button", { name: /^Approve / }).first().focus();
  for (let field = 0; field < 9; field++) {
    const focused = page.locator(":focus");
    await expect(focused).toHaveAccessibleName(/^Approve /);
    const outline = await focused.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe("none");
    await page.keyboard.press(field % 2 === 0 ? "Enter" : "Space");
    // Focus stays on the same button, now offering to reopen the field.
    await expect(focused).toHaveAccessibleName(/^Reopen /);
    if (field < 8) {
      await page.keyboard.press("Tab"); // Edit
      await page.keyboard.press("Tab"); // next field's Approve
    }
  }
  await expect(page.getByTestId("final-record")).toBeVisible();
  await expect(page.getByTestId("live-region")).toContainText("final record is ready");
});
