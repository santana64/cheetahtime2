import { PageHeader } from "@/components/app/ui-kit";
import { BackupManager } from "@/features/backup/backup-manager";
import { getBackupConfig, listSnapshots } from "@/services/backup-store";

export const dynamic = "force-dynamic";

export default async function BackupPage() {
  const [snapshots, config] = await Promise.all([listSnapshots(), getBackupConfig()]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Données · sécurité"
        title="Sauvegarde & restauration"
        description="Vos données restent 100 % sur ce poste (aucun cloud). Plusieurs filets de sécurité selon l'usage : copies automatiques, export/import, dossier externe et restauration."
      />
      <BackupManager snapshots={snapshots} config={config} />
    </div>
  );
}
