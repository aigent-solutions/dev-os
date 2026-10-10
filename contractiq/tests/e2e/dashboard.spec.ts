import { seedContract } from '../helpers/factories';
import { sql } from '../helpers/db';
import { expect, test } from './support';

// 10-dashboard.md §12 (+ 13 §12 delete from the row menu). Contracts are seeded directly (completed, no PDF).
test('new user: empty state → CTA → /contracts/new', async ({ page, user }) => {
  void user;
  await page.goto('/dashboard');
  const empty = page.getByRole('region', { name: 'No contracts reviewed yet' });
  await expect(empty).toBeVisible();
  await empty.getByRole('link', { name: 'Review a Contract' }).click();
  await expect(page).toHaveURL(/\/contracts\/new$/);
});

test.describe('with 22 contracts', () => {
  test('sort by name, filter NDA, paginate, open a row', async ({ page, user }) => {
    for (let i = 1; i <= 22; i++) {
      const c = await seedContract(user.id, { file_name: `Contract ${String(i).padStart(2, '0')}.pdf`, contract_type: i % 2 ? 'nda' : 'msa' });
      await sql(`update public.contracts set created_at = now() - make_interval(mins => $2) where id = $1`, [c.id, 100 - i]);
    }
    await page.goto('/dashboard');
    const rows = page.locator('table tbody tr');
    const firstName = () => rows.first().locator('td').first();

    await page.getByRole('columnheader', { name: /Name/ }).getByRole('button').click();
    await expect(page).toHaveURL(/sort=file_name/);
    await expect(firstName()).toHaveText('Contract 01.pdf');
    await page.getByRole('columnheader', { name: /Name/ }).getByRole('button').click();
    await expect(firstName()).toHaveText('Contract 22.pdf');

    await page.getByRole('group', { name: 'Filter by type' }).getByRole('button', { name: 'NDA' }).click();
    await expect(page).toHaveURL(/type=nda/);
    await expect(rows).toHaveCount(11);
    await expect(page.locator('table tbody').getByText('MSA', { exact: true })).toHaveCount(0);

    await page.getByRole('group', { name: 'Filter by type' }).getByRole('button', { name: 'All' }).click();
    await expect(page.getByText('Showing 1–20 of 22')).toBeVisible();
    await page.getByRole('navigation', { name: 'Pagination' }).getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Showing 21–22 of 22')).toBeVisible();
    await expect(rows).toHaveCount(2);

    const target = rows.first();
    const name = await target.locator('td').first().innerText();
    await target.locator('td').nth(1).click(); // a cell, not the link
    await expect(page).toHaveURL(/\/contracts\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  });

  test('delete from the row menu → toast, row gone, summary decremented', async ({ page, user }) => {
    await seedContract(user.id, { file_name: 'Keep me.pdf' });
    await seedContract(user.id, { file_name: 'Delete me.pdf' });
    await page.goto('/dashboard');
    const total = page.locator('dt', { hasText: 'Total contracts' }).locator('xpath=following-sibling::dd[1]');
    await expect(total).toHaveText('2');
    await page.getByRole('button', { name: 'Actions for Delete me.pdf' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete contract' }).click();
    await expect(page.getByText('Contract deleted').first()).toBeVisible();
    await expect(page.locator('table tbody').getByText('Delete me.pdf')).toHaveCount(0);
    await expect(page.locator('table tbody').getByText('Keep me.pdf')).toBeVisible();
    await expect(total).toHaveText('1');
  });
});
