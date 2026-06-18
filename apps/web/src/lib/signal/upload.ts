/**
 * Client-side upload of an outbound Signal attachment to /api/v1/signal/media,
 * with real progress. fetch() can't report upload progress, so this uses XHR.
 * Resolves with the stored-attachment metadata to hand to /api/v1/signal/send.
 */

export interface StoredAttachment {
  storage_key: string;
  content_type: string | null;
  filename: string | null;
  size: number | null;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  /** 0–100, rounded. */
  pct: number;
}

export function uploadSignalMedia(
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<StoredAttachment> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/v1/signal/media");
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress({
          loaded: e.loaded,
          total: e.total,
          pct: Math.round((e.loaded / e.total) * 100),
        });
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText) as {
            data?: StoredAttachment;
          };
          if (body.data) resolve(body.data);
          else reject(new Error("Upload returned no data"));
        } catch {
          reject(new Error("Bad upload response"));
        }
        return;
      }
      let msg = `Upload failed (${xhr.status})`;
      try {
        const body = JSON.parse(xhr.responseText) as {
          errors?: { message: string }[];
        };
        if (body.errors?.[0]?.message) msg = body.errors[0].message;
      } catch {
        /* keep the status-code message */
      }
      reject(new Error(msg));
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));

    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}
