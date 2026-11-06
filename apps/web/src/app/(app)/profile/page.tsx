import { PageHeader } from "@/components/PageHeader";
import { ProfileView } from "./ProfileView";

export default function ProfilePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Your profile" sub="Your wallet, your ENS name and every invoice you are part of." />
      <div className="max-w-3xl">
        <ProfileView />
      </div>
    </div>
  );
}
