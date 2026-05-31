# Wholesale Ledger — User Guide

Welcome to the Wholesale Ledger application. This tool is designed to help you manage your shop's inventory, sales, and customer ledgers with ease.

## Quick Start
1.  **Dashboard:** View your business at a glance.
2.  **Customers:** Add and manage your clients. View their full transaction history and outstanding balance.
3.  **Products:** Track your stock levels and set reorder alerts.
4.  **Sales & Payments:** Record new sales and payments. The system automatically updates stock and balances.
5.  **Ledger:** View a shop-wide, unified running account book of all financial transactions across all customers with powerful date range, customer, and transaction-type filters.
6.  **Reports:** Generate weekly or monthly business summaries and export them to PDF.

## Keyboard Shortcuts
Use these shortcuts to navigate faster:
- `Alt + D`: Dashboard
- `Alt + C`: Customers
- `Alt + P`: Products
- `Alt + N`: New Sale
- `Alt + T`: Stock Purchase (Inventory)
- `Alt + W`: Record Payment (Wallet)
- `Alt + L`: Ledger
- `Alt + R`: Reports
- `Alt + S`: Settings

## Cloud Sync
The app works offline by default. If you have configured a Cloudflare D1 sync worker in **Settings**, the app will automatically synchronize your data every 5 minutes. You can also trigger a manual sync using the refresh icon in the top header.

### Sync Key
- Add environment variable in Cloudflare worker settings:

```
SYNC_SECRET=your-secret-key
```

- Create a base64 encoded string: 

```
echo -n "WORKER_URL|SYNC_SECRET" | base64
```

The above key is your secret key.

- Add the encoded string to the **Settings** page.

## Exporting to PDF
On the **Reports**, **Ledger**, and **Customer Detail** pages, click the "Download PDF" or "Print Ledger" button to save a clean, professional document for your records or to share with customers.

