# Audited Edit Hub

Additional Requirements:

1. No direct delete allowed.

   Use Active/Inactive status instead.

2. Before saving changes:

   Show confirmation popup.

3. Record old value and new value in audit log.

4. Display who modified the record.

Columns:

CreatedBy

CreatedDate

ModifiedBy

ModifiedDate

5. Support Excel Import

Button:

Import Excel

User uploads template file.

System validates data before save.

6. Display change history for each row.

Button:

View History

7. Row locking mechanism.

If User A is editing a record,

User B cannot edit the same record simultaneously.

8. Backup export feature.

Export all master data to Excel.

9. Dashboard notification.

Show latest updated records.

Show latest editor name.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/acb7414c-098c-4b7c-9ed9-a1e1f7c21ccb).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
