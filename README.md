# Contact Vault - Firebase & TypeScript

A modular React, TypeScript, and Tailwind CSS contact vault application powered by Firebase Authentication & Firestore Database.

## Quick Setup

1. **Extract Zip**: Extract this zip file into your local project directory.
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Configure Firebase**:
   - Create a file named `.env` in the root directory.
   - Copy the contents from `.env.example` into `.env`.
   - Replace the values with your actual Firebase Project credentials (from your Firebase Console -> Project Settings).
4. **Enable Firebase Services**:
   - **Authentication**: Enable **Email/Password** sign-in method in Firebase Console.
   - **Cloud Firestore**: Create a Firestore Database in production/test mode.
5. **Run Locally**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.
