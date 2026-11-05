export interface Contact {
  id: string;
  userId: string;
  name: string;
  phone: string;
  email: string;
  category: 'Family' | 'Work' | 'Friends' | 'Other';
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName?: string | null;
}
