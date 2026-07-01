import { useEffect, useState } from 'react';
import type { CsgWorkerClient } from '../csg/CsgWorkerClient';
import { exportEnclosureZip } from '../export/stlExport';
import type { EnclosureProject } from '../types/project';

interface ExportModalProps {
  client: CsgWorkerClient;
  project: EnclosureProject;
  onClose: () => void;
}

export function ExportModal({ client, project, onClose }: ExportModalProps) {
  const [status, setStatus] = useState('Starting export...');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    exportEnclosureZip(client, project, (s) => {
      if (!cancelled) setStatus(s);
    })
      .then(() => {
        if (!cancelled) setDone(true);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [client, project]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <h3>Export STL</h3>
        {error ? (
          <p className="modal-error">Export failed: {error}</p>
        ) : (
          <p>{done ? 'Download started.' : status}</p>
        )}
        {(done || error) && (
          <button type="button" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}
