// The take for this video: what happens on screen during each beat.
// Run:  node take.mjs          record it
//       node take.mjs --dry    check every locator fast, without recording
import { take } from "__SKILL__/scripts/lib/take.mjs";

await take(import.meta.url, async ({ page, beat, move, hover, click, type, pause, zoom, zoomOut }) => {
  const dialog = page.getByRole("dialog");

  // 1. The line says what the video does. Let the screen breathe, then drift
  //    toward the first control so the viewer's eye is already there.
  await beat(async () => {
    await pause(1400);
    await move(page.locator("#list"));
    await pause(900);
    await hover(page.getByRole("button", { name: "New task" }));
  });

  // 2. Click on the word, not before it.
  await beat(async (b) => {
    await b.at("New task");
    await click(page.getByRole("button", { name: "New task" }));
    await dialog.waitFor();
  });

  // 3. Zoom in on the form while typing. type() clicks the field first.
  await beat(async () => {
    await zoom(dialog);
    await type(dialog.getByLabel("Title"), "Update the pricing page");
  }, { tail: 300 });

  // 4. Show the choices before choosing: hover the others, pick at the name.
  await beat(async (b) => {
    await b.at("Assignee");
    await click(dialog.getByRole("button", { name: "Assignee" }));
    await pause(450);
    await hover(page.getByRole("option", { name: /Marcus/ }));
    await pause(450);
    await hover(page.getByRole("option", { name: /Dana/ }));
    await b.at("Priya");
    await hover(page.getByRole("option", { name: /Priya/ }));
    await pause(200);
    await click(page.getByRole("option", { name: /Priya/ }));
  });

  // 5. Two actions, each on its word.
  await beat(async (b) => {
    await b.at("High");
    await click(dialog.getByRole("button", { name: "High" }));
    await b.at("Create task");
    await click(dialog.getByRole("button", { name: "Create task" }));
    await zoomOut();
  });

  // 6. Rest on the result: ease back to the whole list, find the new row,
  //    land on the name as it's spoken. End still, with a longer tail.
  await beat(async (b) => {
    await pause(300);
    const row = page.getByRole("row").first();
    await zoom(page.locator("#list"), { scale: 1.25 });
    await move(row.getByText("Update the pricing page"));
    await b.at("Priya");
    await hover(row.getByText("Priya Shah"));
  }, { tail: 1400 });
});
