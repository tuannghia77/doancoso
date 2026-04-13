import { Mic, PauseCircle, PlayCircle, RefreshCcw, Square, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

export type RecorderPayload = {
  audioBlob: Blob | null;
  audioUrl: string;
  durationSeconds: number;
  volumeSamples: Array<{ time: number; value: number }>;
};

type AudioRecorderProps = {
  onCaptureChange: (payload: RecorderPayload) => void;
};

export function AudioRecorder({ onCaptureChange }: AudioRecorderProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const samplesRef = useRef<Array<{ time: number; value: number }>>([]);

  const [isRecording, setIsRecording] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [error, setError] = useState('');
  const [liveLevel, setLiveLevel] = useState(0);

  const meterBars = useMemo(
    () => Array.from({ length: 14 }, (_, index) => Math.max(18, ((index % 5) + 2) * 10 + Math.round(liveLevel * 0.4))),
    [liveLevel]
  );

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    audioContextRef.current?.close();
    audioContextRef.current = null;
    setLiveLevel(0);
  };

  useEffect(() => () => cleanupStream(), []);

  const startRecording = async () => {
    try {
      setError('');
      chunksRef.current = [];
      samplesRef.current = [];
      setDurationSeconds(0);
      setLiveLevel(0);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      const buffer = new Uint8Array(analyser.fftSize);

      source.connect(analyser);
      analyser.fftSize = 512;

      streamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioContextRef.current = audioContext;
      startedAtRef.current = Date.now();

      intervalRef.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(buffer);
        let sumSquares = 0;
        for (const item of buffer) {
          const normalized = item / 128 - 1;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / buffer.length);
        const elapsedSeconds = (Date.now() - startedAtRef.current) / 1000;
        samplesRef.current.push({
          time: Number(elapsedSeconds.toFixed(2)),
          value: Number(Math.min(1, rms * 4).toFixed(3))
        });
        setLiveLevel(Math.min(100, Math.round(rms * 420)));
        setDurationSeconds(elapsedSeconds);
      }, 250);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const nextPreviewUrl = URL.createObjectURL(blob);
        const finalDuration = Number(((Date.now() - startedAtRef.current) / 1000).toFixed(1));

        setDurationSeconds(finalDuration);
        setPreviewUrl(nextPreviewUrl);
        onCaptureChange({
          audioBlob: blob,
          audioUrl: nextPreviewUrl,
          durationSeconds: finalDuration,
          volumeSamples: samplesRef.current
        });
        cleanupStream();
      };

      recorder.start();
      setIsRecording(true);
    } catch (_recorderError) {
      setError('Trình duyệt không cấp quyền micro hoặc không hỗ trợ ghi âm.');
      cleanupStream();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const resetCapture = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl('');
    setDurationSeconds(0);
    setLiveLevel(0);
    chunksRef.current = [];
    samplesRef.current = [];
    onCaptureChange({
      audioBlob: null,
      audioUrl: '',
      durationSeconds: 0,
      volumeSamples: []
    });
  };

  return (
    <section className="panel-card recorder-card recorder-card-premium recorder-card-studio">
      <div className="section-heading compact-heading recorder-heading">
        <div>
          <p className="eyebrow">Thu âm</p>
          <h3>Ghi lại bài nói</h3>
        </div>
        <div className="recorder-meta-cluster">
          <span className={`status-pill ${isRecording ? 'recording' : ''}`}>
            {isRecording ? <Mic size={15} /> : <PauseCircle size={15} />}
            <span>{isRecording ? 'Đang ghi' : 'Sẵn sàng'}</span>
          </span>
          <span className="badge-soft recorder-duration-pill">{durationSeconds.toFixed(1)} giây</span>
        </div>
      </div>

      <div className="recorder-status-grid">
        <div className="recorder-status-card">
          <span>Trạng thái</span>
          <strong>{isRecording ? 'Đang thu' : previewUrl ? 'Có bản ghi' : 'Chờ bắt đầu'}</strong>
        </div>
        <div className="recorder-status-card">
          <span>Mức âm hiện tại</span>
          <strong>{liveLevel}%</strong>
        </div>
        <div className="recorder-status-card">
          <span>Đồng bộ</span>
          <strong>{previewUrl ? 'Sẵn sàng phân tích' : 'Chưa có dữ liệu'}</strong>
        </div>
      </div>

      <div className="recorder-live-card">
        <div className="recorder-live-head">
          <div className="recorder-preview-icon">
            <Volume2 size={16} />
          </div>
          <div>
            <strong>Mức âm thời gian thực</strong>
            <p>{isRecording ? 'Giữ giọng đều để AI phân tích tốt hơn.' : 'Bắt đầu ghi để xem nhịp âm lượng.'}</p>
          </div>
        </div>

        <div className="recorder-live-meter">
          <span style={{ width: `${Math.max(8, liveLevel)}%` }} />
        </div>

        <div className="recorder-wave-bars" aria-hidden="true">
          {meterBars.map((height, index) => (
            <span key={`${height}-${index}`} style={{ height: `${height}%` }} className={isRecording ? 'active' : ''} />
          ))}
        </div>
      </div>

      <div className="recorder-toolbar">
        {!isRecording ? (
          <button type="button" className="primary-button" onClick={startRecording}>
            <PlayCircle size={18} />
            Bắt đầu ghi
          </button>
        ) : (
          <button type="button" className="danger-button" onClick={stopRecording}>
            <Square size={18} />
            Dừng ghi
          </button>
        )}
        <button type="button" className="ghost-button" onClick={resetCapture}>
          <RefreshCcw size={16} />
          Làm mới
        </button>
      </div>

      <div className="recorder-preview-card recorder-preview-card-elevated">
        <div className="recorder-preview-head">
          <div className="recorder-preview-icon">
            <Volume2 size={16} />
          </div>
          <div>
            <strong>Bản ghi gần nhất</strong>
            <p>{previewUrl ? 'Nghe lại trước khi gửi AI phân tích.' : 'Ghi xong để mở phần nghe lại.'}</p>
          </div>
        </div>

        {previewUrl ? <audio className="audio-player" controls src={previewUrl} /> : <div className="wave-placeholder" />}
      </div>

      {error ? <p className="error-text">{error}</p> : null}
    </section>
  );
}
