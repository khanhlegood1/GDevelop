import { readConfig } from "@/server/config";
import { Vs1App } from "@/components/Vs1App";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const config = readConfig();
  return (
    <Vs1App
      googleConfigured={config.googleConfigured}
      devAuthEnabled={config.devAuthEnabled}
      devInviteHint={config.devAuthEnabled ? config.devInviteCode : undefined}
    />
  );
}
