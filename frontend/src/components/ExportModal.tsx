import { useEffect, useState } from 'react';
import type { CsgWorkerClient } from '../csg/CsgWorkerClient';
import { exportCalibrationPackZip, exportEnclosureZip } from '../export/stlExport';
import { exportEnclosure3mf } from '../export/threeMfExport';
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
  const [calibrationStatus, setCalibrationStatus] = useState<string | null>(null);
  const [threeMfStatus, setThreeMfStatus] = useState<string | null>(null);

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
          <>
            {!error && (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setCalibrationStatus('Generating calibration pack...');
                    exportCalibrationPackZip(client, project, setCalibrationStatus).catch((err: Error) =>
                      setCalibrationStatus(`Calibration export failed: ${err.message}`),
                    );
                  }}
                >
                  Download calibration pack
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setThreeMfStatus('Generating 3MF...');
                    exportEnclosure3mf(client, project, setThreeMfStatus).catch((err: Error) =>
                      setThreeMfStatus(`3MF export failed: ${err.message}`),
                    );
                  }}
                >
                  Download 3MF
                </button>
              </>
            )}
            {calibrationStatus && <p>{calibrationStatus}</p>}
            {threeMfStatus && <p>{threeMfStatus}</p>}
            <button type="button" onClick={onClose}>
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
