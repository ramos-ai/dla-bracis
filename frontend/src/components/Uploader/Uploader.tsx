import React, { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { uploadFile } from "../../services/GridFsService";
import { getDatasetById } from "../../services/datasetsService";
import { useAlertConfirm } from "../../contexts/AlertConfirmContext";
import Button from "../Fields/Button";
import { Icon } from "../Icons/Icons";
import './Uploader.scss';

interface UploadFile {
  file: File;
  progress: number;
  uploading: boolean;
  error?: string | null;
}

interface UploaderProps {
  datasetId: string;
  userId: string;
}

const MAX_FILES_PER_UPLOAD = 500;
const MAX_FILE_SIZE_MB = 25;

const Uploader: React.FC<UploaderProps> = ({ datasetId, userId }) => {
  const navigate = useNavigate();
  const { alert: showAlert } = useAlertConfirm();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [datasetName, setDatasetName] = useState<string>("");
  const [isUploadingAll, setIsUploadingAll] = useState<boolean>(false);
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  const [uploadedCount, setUploadedCount] = useState<number>(0);
  const [totalToUpload, setTotalToUpload] = useState<number>(0);
  const [currentUploadFileName, setCurrentUploadFileName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchDatasetName = async () => {
      try {
        const dataset = await getDatasetById(datasetId);
        setDatasetName(dataset.dataset_name || "");
      } catch {
        setDatasetName("");
      }
    };
    if (datasetId) fetchDatasetName();
  }, [datasetId]);

  function sanitizeName(name: string): string {
    if (!name || name.trim().length === 0) return "";
    const nameWithoutExt = name.replace(/\.[^/.]+$/, "");
    let sanitized = nameWithoutExt
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9\s\-_]/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .substring(0, 50);
    if (!sanitized || sanitized.length === 0) sanitized = "file";
    return sanitized;
  }

  function generateMediaName(originalFileName: string): string {
    const timestamp = Date.now();
    const sanitizedDatasetName = datasetName ? sanitizeName(datasetName) : "dataset";
    const sanitizedFileName = sanitizeName(originalFileName) || "image";
    let mediaName = `${timestamp}_${sanitizedDatasetName}_${sanitizedFileName}`;
    if (mediaName.length < 3) mediaName = `${timestamp}_media_file`;
    if (mediaName.length > 100) {
      const prefix = `${timestamp}_${sanitizedDatasetName}_`;
      const maxFileNameLength = 100 - prefix.length;
      const truncatedFileName = sanitizedFileName.substring(0, Math.max(3, maxFileNameLength));
      mediaName = `${prefix}${truncatedFileName}`;
    }
    if (mediaName.length < 3) mediaName = `${timestamp}_media_file`;
    return mediaName;
  }

  function validate(file: File): string | null {
    const maxSize = MAX_FILE_SIZE_MB * 1024 * 1024;
    const validTypes = ["image/", "video/"];
    if (!validTypes.some((type) => file.type.startsWith(type))) return "Tipo inválido";
    if (file.size > maxSize) return `Máx. ${MAX_FILE_SIZE_MB} MB`;
    return null;
  }

  function handleFiles(selected: File[]) {
    const validated = selected.map((file) => ({
      file,
      progress: 0,
      uploading: false,
      error: validate(file),
    }));
    setFiles((prev) => {
      const next = [...prev, ...validated];
      if (next.length > MAX_FILES_PER_UPLOAD) {
        setTimeout(() => showAlert(`Máximo de ${MAX_FILES_PER_UPLOAD} imagens por vez.`), 0);
        return next.slice(0, MAX_FILES_PER_UPLOAD);
      }
      return next;
    });
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(Array.from(e.dataTransfer.files));
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave() {
    setIsDragOver(false);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) handleFiles(Array.from(e.target.files));
  }

  async function uploadFileAtIndex(index: number, retryCount = 0): Promise<boolean> {
    const MAX_RETRIES = 3;
    const fileName = files[index].file.name;
    setCurrentUploadFileName(fileName);

    const formData = new FormData();
    formData.append("file", files[index].file);
    formData.append("mediaName", generateMediaName(fileName));
    formData.append("datasetId", datasetId);
    formData.append("userId", userId);

    setFiles((prev) => {
      const updated = [...prev];
      updated[index].uploading = true;
      updated[index].error = null;
      return updated;
    });

    try {
      await uploadFile(formData, (progress: number) => {
        setFiles((prev) => {
          const updated = [...prev];
          updated[index].progress = progress;
          return updated;
        });
      });

      setFiles((prev) => {
        const updated = [...prev];
        updated[index].uploading = false;
        updated[index].progress = 100;
        return updated;
      });
      setCurrentUploadFileName(null);
      return true;
    } catch {
      if (retryCount < MAX_RETRIES) {
        const delay = Math.pow(2, retryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return uploadFileAtIndex(index, retryCount + 1);
      }
      setFiles((prev) => {
        const updated = [...prev];
        updated[index].error = "Erro ao enviar";
        updated[index].uploading = false;
        return updated;
      });
      setCurrentUploadFileName(null);
      return false;
    }
  }

  useEffect(() => {
    if (isUploadingAll && totalToUpload > 0 && files.length > 0) {
      const validFiles = files.filter((f) => !f.error);
      const completedCount = validFiles.filter((f) => f.progress === 100).length;
      const allFinished = validFiles.every((f) => !f.uploading);
      setUploadedCount(completedCount);

      if (allFinished && completedCount >= totalToUpload) {
        const hasErrors = files.some((f) => f.error);
        if (!hasErrors) {
          setIsUploadingAll(false);
          setUploadSuccess(true);
          navigate(`/datasets/new?id=${datasetId}`);
          setTimeout(() => {
            showAlert('Imagens adicionadas com sucesso!');
          }, 100);
        } else {
          setIsUploadingAll(false);
          const failedCount = files.filter((f) => f.error).length;
          showAlert(`${failedCount} imagem(ns) não puderam ser enviadas.`);
        }
      }
    }
  }, [files, isUploadingAll, totalToUpload, datasetId, navigate, showAlert]);

  async function uploadAll() {
    const filesToUpload = files
      .map((f, i) => ({ file: f, index: i }))
      .filter(({ file }) => !file.error && !file.uploading && file.progress < 100);

    if (filesToUpload.length === 0) {
      const allUploaded = files.every((f) => f.progress === 100 && !f.error);
      if (allUploaded) {
        setUploadSuccess(true);
        navigate(`/datasets/new?id=${datasetId}`);
        setTimeout(() => showAlert('Imagens adicionadas com sucesso!'), 100);
      } else {
        showAlert("Nenhuma imagem válida para enviar.");
      }
      return;
    }

    setIsUploadingAll(true);
    setUploadSuccess(false);
    setUploadedCount(0);
    setTotalToUpload(filesToUpload.length);

    try {
      for (const { index } of filesToUpload) {
        await uploadFileAtIndex(index);
      }
    } catch {
      setIsUploadingAll(false);
      showAlert("Erro ao fazer upload das imagens.");
    }
  }

  const validCount = files.filter(f => !f.error).length;
  const errorCount = files.filter(f => f.error).length;
  const completedCount = files.filter(f => f.progress === 100).length;
  const progressPercent = totalToUpload > 0 ? Math.round((uploadedCount / totalToUpload) * 100) : 0;

  return (
    <div className="uploader">
      <div className="uploader__card">
        {/* Header */}
        <div className="uploader__header">
          <h2 className="uploader__title">Upload de Imagens</h2>
          <p className="uploader__subtitle">
            Máximo {MAX_FILES_PER_UPLOAD} imagens · {MAX_FILE_SIZE_MB} MB por arquivo
          </p>
        </div>

        {/* Dropzone */}
        <div
          className={`uploader__dropzone ${isDragOver ? 'uploader__dropzone--active' : ''} ${files.length > 0 ? 'uploader__dropzone--compact' : ''}`}
          onClick={() => !isUploadingAll && inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <Icon name="upload" size={32} />
          <p className="uploader__dropzone-text">
            {isDragOver ? 'Solte as imagens aqui' : 'Arraste imagens ou clique para selecionar'}
          </p>
          <input
            type="file"
            ref={inputRef}
            multiple
            accept="image/*,video/*"
            hidden
            onChange={handleChange}
            disabled={isUploadingAll}
          />
        </div>

        {/* File list / Progress */}
        {files.length > 0 && (
          <div className="uploader__content">
            {/* Summary */}
            <div className="uploader__summary">
              <span className="uploader__count">
                {validCount} {validCount === 1 ? 'imagem' : 'imagens'} selecionada{validCount !== 1 ? 's' : ''}
              </span>
              {errorCount > 0 && (
                <span className="uploader__error-count">{errorCount} com erro</span>
              )}
              {completedCount > 0 && !isUploadingAll && (
                <span className="uploader__success-count">{completedCount} enviada{completedCount !== 1 ? 's' : ''}</span>
              )}
            </div>

            {/* Progress bar during upload */}
            {isUploadingAll && (
              <div className="uploader__progress-section">
                <div className="uploader__progress-bar">
                  <div 
                    className="uploader__progress-fill" 
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="uploader__progress-info">
                  <span className="uploader__progress-text">
                    {uploadedCount} de {totalToUpload} ({progressPercent}%)
                  </span>
                  {currentUploadFileName && (
                    <span className="uploader__current-file" title={currentUploadFileName}>
                      {currentUploadFileName.length > 30 
                        ? currentUploadFileName.substring(0, 30) + '...' 
                        : currentUploadFileName}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* File list (compact) */}
            {!isUploadingAll && files.length <= 10 && (
              <div className="uploader__file-list">
                {files.map((f, i) => (
                  <div key={i} className={`uploader__file-item ${f.error ? 'uploader__file-item--error' : ''} ${f.progress === 100 ? 'uploader__file-item--done' : ''}`}>
                    <span className="uploader__file-name" title={f.file.name}>
                      {f.file.name.length > 35 ? f.file.name.substring(0, 35) + '...' : f.file.name}
                    </span>
                    {f.error && <span className="uploader__file-status uploader__file-status--error">{f.error}</span>}
                    {f.progress === 100 && !f.error && <Icon name="check" size={16} />}
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="uploader__actions">
              {!isUploadingAll && (
                <Button 
                  variant="secondary" 
                  onClick={() => setFiles([])}
                >
                  Limpar
                </Button>
              )}
              <Button
                onClick={uploadAll}
                disabled={isUploadingAll || uploadSuccess || validCount === 0}
              >
                {isUploadingAll ? 'Enviando...' : `Enviar ${validCount > 0 ? `(${validCount})` : ''}`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Uploader;
