import { expect, seedCompletedContract, test } from './support';

// 11-feedback.md §12.
test('👍 → thanks → "Partially" + comment → Send → reload keeps everything', async ({ page, user }) => {
  const id = await seedCompletedContract(page, user);
  await page.goto(`/contracts/${id}`);
  const widget = page.getByRole('region', { name: 'Was this review helpful?' });
  await widget.getByRole('button', { name: 'Yes, helpful' }).click();
  await expect(widget.getByText('Thanks for your feedback')).toBeVisible();
  await widget.getByRole('radio', { name: 'Partially' }).check();
  await widget.getByRole('textbox').fill('The breach remedy needed checking.');
  await widget.getByRole('button', { name: 'Send comment' }).click();
  await expect(widget.getByRole('button', { name: 'Send comment' })).toBeDisabled(); // saved == draft

  await page.reload();
  const again = page.getByRole('region', { name: 'Was this review helpful?' });
  await expect(again.getByRole('button', { name: 'Yes, helpful' })).toHaveAttribute('aria-pressed', 'true');
  await expect(again.getByRole('radio', { name: 'Partially' })).toBeChecked();
  await expect(again.getByRole('textbox')).toHaveValue('The breach remedy needed checking.');
});
