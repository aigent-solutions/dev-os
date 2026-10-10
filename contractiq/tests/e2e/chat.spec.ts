import { expect, mockOverride, seedCompletedContract, test, uniqueToken } from './support';

// 09-contract-chat.md §12.
test('ask → streamed answer with a Page chip → the chip moves the viewer; history persists on reload', async ({ page, user }) => {
  const id = await seedCompletedContract(page, user);
  await page.goto(`/contracts/${id}`);
  await page.getByRole('tab', { name: 'Chat' }).click();
  const box = page.getByRole('textbox', { name: 'Ask a question about this contract' });
  await box.fill('How can either party end this agreement?');
  await box.press('Enter');
  const answer = page.getByRole('log', { name: 'Conversation' });
  await expect(answer.getByText(/either party can end the agreement by giving thirty \(30\) days/)).toBeVisible({ timeout: 20_000 });
  await answer.getByRole('button', { name: 'Go to page 3 in the document' }).first().click();
  await expect(page.getByText('Page 3 of 4')).toBeVisible();

  await page.reload();
  await page.getByRole('tab', { name: 'Chat' }).click();
  await expect(page.getByRole('log', { name: 'Conversation' }).getByText('How can either party end this agreement?')).toBeVisible();
  await expect(page.getByRole('log', { name: 'Conversation' }).getByText(/thirty \(30\) days/)).toBeVisible();
});

test('an off-document question → "I cannot find this in the document."', async ({ page, user }) => {
  const id = await seedCompletedContract(page, user);
  const question = `What is the company's annual revenue? (${uniqueToken()})`;
  await mockOverride(page, { match: question, kind: 'chat', text: 'I cannot find this in the document.' });
  await page.goto(`/contracts/${id}`);
  await page.getByRole('tab', { name: 'Chat' }).click();
  await page.getByRole('textbox', { name: 'Ask a question about this contract' }).fill(question);
  await page.getByRole('textbox', { name: 'Ask a question about this contract' }).press('Enter');
  const log = page.getByRole('log', { name: 'Conversation' });
  await expect(log.getByText('I cannot find this in the document.')).toBeVisible({ timeout: 20_000 });
  await expect(log.getByRole('button', { name: /Go to page/ })).toHaveCount(0);
});
