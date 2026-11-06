import { ProfileView } from "./ProfileView";

export default function ProfilePage() {
  return (
    <div className="grid max-w-2xl gap-6">
      <h1 className="text-2xl font-semibold">Your profile</h1>
      <ProfileView />
    </div>
  );
}
