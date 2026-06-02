export interface Admin {
  id: number;
  email: string;
  permissions: any;
  added_by: string;
  created_at: string;
}

export interface AdminLog {
  id: number;
  admin_email: string;
  action: string;
  details: any;
  created_at: string;
}

export interface AppLog {
  id: number;
  user_email: string;
  action_summary: string;
  details: any;
  created_at: string;
}

export interface Coupon {
  id: number;
  code: string;
  discount_type: string;
  expiry_date: string;
  max_supply: number | null;
  used_count: number;
  created_by: string;
  created_at: string;
}

export interface Ticket {
  id: number;
  title: string;
  description: string;
  price: number;
  status: string;
  school_id: number;
  created_at: string;
}

export interface Gist {
  id: number;
  title: string;
  content: string;
  school_id: number;
  status: string;
  created_at: string;
}

export interface ReferralStat {
  referrer_email: string;
  total_referred: number;
  successful_referrals: number;
}
