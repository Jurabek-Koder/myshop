import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { AUDIENCE_CATEGORIES } from '../constants/audienceCategories.js';
import { getApiPrefix } from '../utils/apiBase.js';

const API = getApiPrefix();

const PRODUCT_CATEGORIES = [
  'Uy ruzgor buyumlari',
  'Erkaklar uchun kiyimlar',
  'Ayollar uchun kiyimlar',
  'Bolalar uchun kiyimlar',
  'Erkaklar uchun poyafzallar',
  'Ayollar uchun poyafzallar',
  'Bolalalar uchun poyafzallar',
  'Erkaklar uchun naborlar',
  'Ayollarlar uchun parfumeriya',
  'Elektro Betavoy texnikalar',
  'Sovgalar tuplami',
  'Sport anjomlari',
  'Guzallik',
];

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error("Faylni o'qib bo'lmadi."));
    reader.readAsDataURL(file);
  });
}

function clampPercent(value) {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  return Math.min(n, 100);
}

function calcShares(price, operatorPercent, sitePercent) {
  const p = Number(price || 0);
  const op = clampPercent(operatorPercent);
  const sf = clampPercent(sitePercent);
  return {
    operatorPercent: op,
    sitePercent: sf,
    valid: op + sf <= 100,
  };
}

function sellerStatusLine(row) {
  const s = String(row?.status || 'pending').trim().toLowerCase();
  if (s === 'active') return 'Sotuvda';
  return 'Tasdiqlanish / sotuv holatini seller panelida tekshiring';
}

function productGalleryUrls(p) {
  if (!p) return [];
  const out = [];
  const seen = new Set();
  const add = (u) => {
    const s = String(u || '').trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  try {
    const g = p.image_gallery_json;
    if (g != null && g !== '') {
      let arr = typeof g === 'string' ? JSON.parse(g) : g;
      if (typeof arr === 'string') {
        try {
          arr = JSON.parse(arr);
        } catch {
          arr = null;
        }
      }
      if (Array.isArray(arr)) {
        for (const x of arr) add(x);
      }
    }
  } catch {
    /* ignore */
  }
  const main = String(p.image_url || '').trim();
  if (main && !seen.has(main)) out.unshift(main);
  return out.slice(0, 5);
}

export default function ProductDetail() {
  const { id } = useParams();
  const { request, user } = useAuth();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [leadForm, setLeadForm] = useState({ full_name: '', contact_phone: '', contact_email: '' });
  const [leadSent, setLeadSent] = useState(false);
  const [leadError, setLeadError] = useState('');
  const { add } = useCart();

  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editStock, setEditStock] = useState('');
  const [editOp, setEditOp] = useState('');
  const [editSite, setEditSite] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');
  const [editMessage, setEditMessage] = useState('');
  const [activeGalleryIdx, setActiveGalleryIdx] = useState(0);

  const loadProduct = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request(`/products/${id}`);
      if (!res.ok) {
        setProduct(null);
        return;
      }
      const data = await res.json();
      setProduct(data);
      setEditName(data.name_uz || '');
      setEditDesc(data.description_uz || '');
      setEditCategory(data.category || '');
      setEditPrice(String(data.price ?? ''));
      setEditStock(String(data.stock ?? ''));
      setEditOp(String(data.operator_share_percent ?? ''));
      setEditSite(String(data.site_fee_percent ?? ''));
      setEditImageUrl(data.image_url || '');
      setActiveGalleryIdx(0);
    } catch {
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, [id, request]);

  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  const isSellerOwner = useMemo(() => {
    const role = String(user?.role || '').toLowerCase();
    return role === 'seller' && user?.seller_id && product?.seller_id === user.seller_id;
  }, [user, product]);

  const editShare = useMemo(
    () => calcShares(editPrice, editOp, editSite),
    [editPrice, editOp, editSite]
  );

  const formatPrice = (n) => new Intl.NumberFormat('uz-UZ').format(n) + ' so\'m';

  const galleryUrls = useMemo(() => productGalleryUrls(product), [product]);
  const safeGalleryIdx =
    galleryUrls.length === 0 ? 0 : Math.min(Math.max(0, activeGalleryIdx), galleryUrls.length - 1);
  const mainDisplayUrl = galleryUrls[safeGalleryIdx] || product?.image_url || '';

  const addToCart = () => {
    add(product, Math.min(qty, product.stock || 999));
  };

  const submitLead = async (e) => {
    e.preventDefault();
    setLeadError('');
    if (!leadForm.contact_phone?.trim() && !leadForm.contact_email?.trim()) {
      setLeadError('Telefon yoki elektron pochtani kiriting.');
      return;
    }
    try {
      const res = await fetch(`${API}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: product.id,
          full_name: leadForm.full_name?.trim() || null,
          contact_phone: leadForm.contact_phone?.trim() || null,
          contact_email: leadForm.contact_email?.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Xatolik');
      setLeadSent(true);
      setLeadForm({ full_name: '', contact_phone: '', contact_email: '' });
    } catch (err) {
      setLeadError(err.message || 'So\'rov yuborilmadi.');
    }
  };

  const handleEditImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      setEditError('Faqat rasm fayl.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setEditError('Rasm 5MB dan oshmasin.');
      return;
    }
    try {
      setEditImageUrl(await fileToDataUrl(file));
      setEditError('');
    } catch (err) {
      setEditError(err.message || 'Rasm yuklanmadi.');
    }
    e.target.value = '';
  };

  const saveSellerEdits = async (e) => {
    e.preventDefault();
    if (!isSellerOwner || !product) return;
    setEditError('');
    setEditMessage('');
    if (!editShare.valid) {
      setEditError('Operator va sayt foizi yig‘indisi 100% dan oshmasin.');
      return;
    }
    setEditBusy(true);
    try {
      const payload = {
        name_uz: editName.trim(),
        description_uz: editDesc.trim() || null,
        category: editCategory.trim() || null,
        price: Number(editPrice) || 0,
        stock: Number.parseInt(editStock, 10) || 0,
        operator_share_percent: editShare.operatorPercent,
        site_fee_percent: editShare.sitePercent,
      };
      const imgChanged = String(editImageUrl || '') !== String(product.image_url || '');
      if (imgChanged) {
        payload.image_url = editImageUrl || null;
        payload.image_gallery_json = editImageUrl ? JSON.stringify([editImageUrl]) : null;
      }

      const res = await request(`/seller/products/${product.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Saqlanmadi');
      setEditMessage('O‘zgarishlar saqlandi.');
      await loadProduct();
    } catch (err) {
      setEditError(err.message || 'Saqlanmadi');
    } finally {
      setEditBusy(false);
    }
  };

  if (loading) return <div className="container" style={{ textAlign: 'center', padding: '3rem' }}>Yuklanmoqda...</div>;
  if (!product) return <div className="container"><p>Mahsulot topilmadi.</p><Link to="/products">Ortga</Link></div>;

  return (
    <div className="container">
      <div className="product-detail card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', padding: '2rem', alignItems: 'start' }}>
        <div className="product-detail-image">
          {mainDisplayUrl ? (
            <img src={mainDisplayUrl} alt={product.name_uz} className="product-detail-main-img" />
          ) : (
            <div className="product-placeholder product-detail-main-placeholder" />
          )}
          {galleryUrls.length > 1 ? (
            <div className="product-detail-thumbs-wrap" role="group" aria-label="Mahsulot rasmlari">
              <div className="product-detail-thumbs">
                {galleryUrls.map((url, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`product-detail-thumb ${idx === safeGalleryIdx ? 'is-active' : ''}`}
                    onClick={() => setActiveGalleryIdx(idx)}
                    aria-label={`Rasm ${idx + 1}`}
                    aria-pressed={idx === safeGalleryIdx}
                  >
                    <img src={url} alt="" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div>
          <h1 className="page-title">{product.name_uz}</h1>
          <div className="deco-line" />
          {product.sale_price != null ? (
            <div style={{ marginBottom: '1rem' }}>
              <span className="product-price-old" style={{ fontSize: '1.1rem', display: 'block' }}>{formatPrice(product.price)}</span>
              <span className="product-price product-price-sale" style={{ fontSize: '1.5rem' }}>{formatPrice(product.sale_price)}</span>
            </div>
          ) : (
            <p className="product-price" style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>{formatPrice(product.price)}</p>
          )}
          {product.description_uz && <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>{product.description_uz}</p>}
          {product.category && <p style={{ marginBottom: '1rem' }}>Kategoriya: <strong>{product.category}</strong></p>}
          <div className="form-group" style={{ maxWidth: 120 }}>
            <label>Miqdori</label>
            <input type="number" min={1} max={product.stock || 999} value={qty} onChange={(e) => setQty(Number(e.target.value) || 1)} />
          </div>
          <button type="button" className="btn btn-gold" onClick={addToCart}>Savatga qo'shish</button>

          {isSellerOwner && (
            <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid var(--border, #e2e8f0)', borderRadius: 8, background: 'var(--bg-card, #f8fafc)' }}>
              <h4 style={{ marginTop: 0 }}>Mahsulotni tahrirlash (seller)</h4>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                Holat: <strong>{sellerStatusLine(product)}</strong>
              </p>
              <form onSubmit={saveSellerEdits}>
                <div className="form-group">
                  <label>Nomi</label>
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Kategoriya</label>
                  <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>
                    <option value="">Tanlang</option>
                    <optgroup label="Mijoz guruhi">
                      {AUDIENCE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Mahsulot kategoriyasi">
                      {PRODUCT_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </optgroup>
                    {editCategory &&
                    ![...AUDIENCE_CATEGORIES, ...PRODUCT_CATEGORIES].includes(editCategory) ? (
                      <option value={editCategory}>{editCategory}</option>
                    ) : null}
                  </select>
                </div>
                <div className="form-group">
                  <label>Rasm</label>
                  <input type="file" accept="image/*" onChange={handleEditImage} />
                  {editImageUrl && <small style={{ display: 'block', marginTop: 6 }}>Rasm tanlangan / yangilangan.</small>}
                </div>
                <div className="form-group">
                  <label>Narx (so&apos;m)</label>
                  <input type="number" min={0} value={editPrice} onChange={(e) => setEditPrice(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Ombor (stock)</label>
                  <input type="number" min={0} value={editStock} onChange={(e) => setEditStock(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Operator ulushi %</label>
                  <input type="number" min={0} max={100} value={editOp} onChange={(e) => setEditOp(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Sayt foizi %</label>
                  <input type="number" min={0} max={100} value={editSite} onChange={(e) => setEditSite(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Tavsif</label>
                  <textarea rows={3} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
                </div>
                {editError && <p style={{ color: '#dc2626', fontSize: '0.9rem' }}>{editError}</p>}
                {editMessage && <p style={{ color: '#059669', fontSize: '0.9rem' }}>{editMessage}</p>}
                <button type="submit" className="btn btn-outline" disabled={editBusy || !editShare.valid}>
                  {editBusy ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </form>
            </div>
          )}

          <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid var(--border, #e2e8f0)', borderRadius: 8 }}>
            <h4 style={{ marginTop: 0 }}>Zakaz qoldirish</h4>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Mahsulot yoqdi mi? Operator siz bilan bog&apos;lanadi va zakaz qabul qiladi.
            </p>
            {leadSent ? (
              <p style={{ color: '#059669', fontWeight: 600 }}>So&apos;rovingiz qabul qilindi. Tez orada siz bilan bog&apos;lanamiz.</p>
            ) : (
              <form onSubmit={submitLead}>
                <div className="form-group">
                  <label>Ism</label>
                  <input type="text" placeholder="Ismingiz" value={leadForm.full_name} onChange={(e) => setLeadForm((f) => ({ ...f, full_name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Telefon *</label>
                  <input type="tel" placeholder="+998901234567" value={leadForm.contact_phone} onChange={(e) => setLeadForm((f) => ({ ...f, contact_phone: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Elektron pochta</label>
                  <input type="email" placeholder="email@example.com" value={leadForm.contact_email} onChange={(e) => setLeadForm((f) => ({ ...f, contact_email: e.target.value }))} />
                </div>
                {leadError && <p style={{ color: '#dc2626', fontSize: '0.9rem' }}>{leadError}</p>}
                <button type="submit" className="btn btn-primary">Yuborish</button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
