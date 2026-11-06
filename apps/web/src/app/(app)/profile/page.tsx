import { ProfileView } from "./ProfileView";

// Registering a name makes two Sepolia transactions (about 30 s). Without this a serverless host stops the action at 10 s.
export const maxDuration = 60;

export default function ProfilePage() {
  return <ProfileView />;
}
