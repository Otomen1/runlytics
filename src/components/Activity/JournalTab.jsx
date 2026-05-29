import React, { useState, useEffect, useRef, useCallback } from 'react';
import { addPhoto, getPhotos, deletePhoto } from '../../db/indexedDB.js';

const MOODS = [
  { key: 'great',  emoji: '😀', label: 'Great' },
  { key: 'good',   emoji: '🙂', label: 'Good' },
  { key: 'normal', emoji: '😐', label: 'Normal' },
  { key: 'tough',  emoji: '😫', label: 'Tough' },
  { key: 'strong', emoji: '🔥', label: 'Strong' },
];

async function makeThumbnail(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxW = 320;
      const scale = Math.min(1, maxW / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(resolve, 'image/jpeg', 0.72);
    };
    img.src = url;
  });
}

export function JournalTab({ act, onPatch }) {
  const [photos, setPhotos] = useState([]);
  const [thumbUrls, setThumbUrls] = useState([]);
  const [lightbox, setLightbox] = useState(null); // full blob url
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const fileInputRef = useRef(null);
  const debounceRef = useRef(null);

  // Load photos on mount
  useEffect(() => {
    getPhotos(act.id).then(setPhotos).catch(console.error);
  }, [act.id]);

  // Generate/revoke thumb URLs when photos change
  useEffect(() => {
    const urls = photos.map(p => URL.createObjectURL(p.thumbBlob));
    setThumbUrls(urls);
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }, [photos]);

  // Cleanup lightbox url on close
  useEffect(() => {
    return () => {
      if (lightboxUrl) URL.revokeObjectURL(lightboxUrl);
    };
  }, [lightboxUrl]);

  const handleMood = (key) => {
    onPatch({ mood: key });
  };

  const handleNotes = (e) => {
    const notes = e.target.value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onPatch({ notes });
    }, 600);
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = '';
    let newCount = 0;
    for (const file of files) {
      try {
        const thumb = await makeThumbnail(file);
        await addPhoto(act.id, file, thumb, file.type);
        newCount++;
      } catch (err) {
        console.error('[Journal] addPhoto failed', err);
      }
    }
    const updated = await getPhotos(act.id);
    setPhotos(updated);
    onPatch({ photoCount: updated.length });
  };

  const handleDelete = async (photo) => {
    await deletePhoto(photo.id);
    const updated = await getPhotos(act.id);
    setPhotos(updated);
    onPatch({ photoCount: updated.length });
  };

  const openLightbox = (photo) => {
    const url = URL.createObjectURL(photo.blob);
    setLightboxUrl(url);
    setLightbox(photo.id);
  };

  const closeLightbox = () => {
    if (lightboxUrl) URL.revokeObjectURL(lightboxUrl);
    setLightboxUrl(null);
    setLightbox(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Mood picker */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--tx2)', marginBottom: 10, letterSpacing: '.05em', textTransform: 'uppercase' }}>How did it feel?</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          {MOODS.map(m => (
            <button
              key={m.key}
              onClick={() => handleMood(m.key)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                padding: '8px 4px',
                border: act.mood === m.key ? '2px solid var(--or)' : '2px solid var(--bd)',
                borderRadius: 10,
                background: 'transparent',
                cursor: 'pointer',
                transform: act.mood === m.key ? 'scale(1.08)' : 'scale(1)',
                transition: 'transform .15s, border-color .15s',
              }}
            >
              <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{m.emoji}</span>
              <span style={{ fontSize: '.6rem', color: act.mood === m.key ? 'var(--or)' : 'var(--tx2)', fontWeight: act.mood === m.key ? 700 : 400 }}>{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--tx2)', marginBottom: 8, letterSpacing: '.05em', textTransform: 'uppercase' }}>Notes</div>
        <textarea
          defaultValue={act.notes || ''}
          onChange={handleNotes}
          placeholder="How did this run feel?"
          rows={4}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: 'var(--bg)',
            color: 'var(--tx)',
            border: '1px solid var(--bd)',
            borderRadius: 8,
            padding: '10px 12px',
            fontFamily: 'inherit',
            fontSize: '.85rem',
            lineHeight: 1.5,
            resize: 'vertical',
            outline: 'none',
          }}
        />
      </div>

      {/* Photos */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--tx2)', letterSpacing: '.05em', textTransform: 'uppercase' }}>Photos</div>
          <button
            className="btn b-gh"
            style={{ padding: '6px 12px', fontSize: '.78rem' }}
            onClick={() => fileInputRef.current?.click()}
          >
            + Add Photo
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </div>
        {photos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--tx2)', fontSize: '.82rem' }}>No photos yet</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {photos.map((photo, i) => (
              <div
                key={photo.id}
                style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '1', background: 'var(--bd)' }}
              >
                <img
                  src={thumbUrls[i]}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer', display: 'block' }}
                  onClick={() => openLightbox(photo)}
                />
                <button
                  onClick={() => handleDelete(photo)}
                  style={{
                    position: 'absolute', top: 4, right: 4,
                    width: 22, height: 22,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(0,0,0,.55)',
                    color: '#fff',
                    fontSize: '.7rem',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1,
                  }}
                  aria-label="Delete photo"
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox !== null && lightboxUrl && (
        <div
          onClick={closeLightbox}
          style={{
            position: 'fixed', inset: 0, zIndex: 400,
            background: 'rgba(0,0,0,.88)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <button
            onClick={closeLightbox}
            style={{
              position: 'absolute', top: 16, right: 16,
              background: 'rgba(255,255,255,.15)',
              border: 'none', color: '#fff',
              borderRadius: '50%', width: 36, height: 36,
              fontSize: '1rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
          <img
            src={lightboxUrl}
            alt=""
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }}
          />
        </div>
      )}
    </div>
  );
}
