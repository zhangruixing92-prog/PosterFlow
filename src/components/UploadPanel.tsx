import { RECOMMENDED_HEIGHT, RECOMMENDED_WIDTH } from '../config/sizes';

interface UploadPanelProps {
  onUpload: (file: File) => void;
  hasImage: boolean;
  imageName?: string;
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];

export function UploadPanel({ onUpload, hasImage, imageName }: UploadPanelProps) {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      alert('仅支持 PNG、JPG、JPEG 格式');
      event.target.value = '';
      return;
    }

    onUpload(file);
    event.target.value = '';
  };

  return (
    <section className="panel upload-panel">
      <div className="panel-header">
        <h2>上传主海报</h2>
        <p>
          推荐尺寸 {RECOMMENDED_WIDTH} × {RECOMMENDED_HEIGHT}，支持 PNG / JPG / JPEG
        </p>
      </div>
      <label className="upload-button">
        <input type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" onChange={handleChange} />
        {hasImage ? '重新上传海报' : '选择海报文件'}
      </label>
      {imageName && <p className="upload-meta">当前文件：{imageName}</p>}
    </section>
  );
}
