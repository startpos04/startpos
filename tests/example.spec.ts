import { test } from '@playwright/test'

test('test', async ({ page }) => {
  await page.goto('http://localhost:3000/login')
  await page.getByRole('textbox', { name: 'Email' }).click()
  await page.getByRole('textbox', { name: 'Email' }).fill('cashier@store.com')
  await page.getByRole('textbox', { name: 'Password' }).click()
  await page.getByRole('textbox', { name: 'Password' }).fill('123qwe123!1')
  await page.getByText('EmailInvalid email addressPasswordSign In').click()
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page
    .locator('div')
    .filter({ hasText: /^Beef Patty \(150g\)₱0\.00PantryING-BEEF$/ })
    .nth(1)
    .click()
  await page.getByRole('button', { name: 'Add to Order' }).click()

  page.once('dialog', dialog => {
    console.info(`Dialog message: ${dialog.message()}`)
    dialog.dismiss().catch(() => {})
  })
  await page.getByRole('button', { name: 'Place Order' }).click()
})
