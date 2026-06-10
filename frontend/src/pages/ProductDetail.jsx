import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { AUDIENCE_CATEGORIES } from '../constants/audienceCategories.js';
import { ALL_NAV_CATEGORIES, CATALOG_NAV_CATEGORIES } from '../constants/catalogCategories.js';
import { API_PREFIX, parseApiJsonText } from '../lib/apiBase';

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

function ProductDetailBackLink() {
  return (
    <Link to="/products" className="product-catalog-back-home product-detail-back" aria-label="Mahsulotlar ro‘yxatiga">
      <i className="fas fa-arrow-left" aria-hidden />
    </Link>
  );
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
      const res = await fetch(`${API_PREFIX}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: product.id,
          full_name: leadForm.full_name?.trim() || null,
          contact_phone: leadForm.contact_phone?.trim() || null,
          contact_email: leadForm.contact_email?.trim() || null,
        }),
      });
      const data = parseApiJsonText(await res.text()) || {};
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

  if (loading)
    return (
      <div
        className="container product-detail-page"
        style={{ paddingBottom: '3rem', paddingLeft: '1rem', paddingRight: '1rem' }}
      >
        <ProductDetailBackLink />
        <p style={{ textAlign: 'center', marginTop: '1.5rem' }}>Yuklanmoqda...</p>
      </div>
    );
  if (!product)
    return (
      <div className="container product-detail-page">
        <ProductDetailBackLink />
        <p>Mahsulot topilmadi.</p>
        <Link to="/products">Ortga</Link>
      </div>
    );

  return (
    <div className="container product-detail-page">
      <ProductDetailBackLink />
      <div className="product-detail card product-detail-card">
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
        <div className="product-detail-info">
          <h1 className="page-title">{product.name_uz}</h1>
          <div className="deco-line" />
          <div className="product-detail-summary">
            {product.sale_price != null ? (
              <div className="product-detail-price-block">
                <span className="product-price-old product-detail-price-old">{formatPrice(product.price)}</span>
                <span className="product-price product-price-sale product-detail-price">{formatPrice(product.sale_price)}</span>
              </div>
            ) : (
              <p className="product-price product-detail-price">{formatPrice(product.price)}</p>
            )}
            {product.description_uz && <p className="product-detail-desc">{product.description_uz}</p>}
            {product.category && (
              <p className="product-detail-category">
                Kategoriya: <strong>{product.category}</strong>
              </p>
            )}
          </div>
          <div className="product-detail-purchase">
            <div className="form-group product-detail-qty">
              <label>Miqdori</label>
              <input
                type="number"
                min={1}
                max={product.stock || 999}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value) || 1)}
              />
            </div>
            <button type="button" className="btn btn-gold product-detail-cart-btn" onClick={addToCart}>
              Savatga qo'shish
            </button>
          </div>

          {isSellerOwner && (
            <div className="product-detail-panel product-detail-panel--seller">
              <h4>Mahsulotni tahrirlash (seller)</h4>
              <p className="product-detail-panel-note">
                Holat: <strong>{sellerStatusLine(product)}</strong>
              </p>
              <form className="product-detail-form-grid" onSubmit={saveSellerEdits}>
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
                    <optgroup label="Do‘kon katalogi bo‘limlari">
                      {CATALOG_NAV_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </optgroup>
                    {editCategory &&
                    !ALL_NAV_CATEGORIES.includes(editCategory) ? (
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

          <div className="product-detail-panel product-detail-panel--lead">
            <h4>Zakaz qoldirish</h4>
            <p className="product-detail-panel-note">
              Mahsulot yoqdi mi? Operator siz bilan bog&apos;lanadi va zakaz qabul qiladi.
            </p>
            {leadSent ? (
              <p style={{ color: '#059669', fontWeight: 600 }}>So&apos;rovingiz qabul qilindi. Tez orada siz bilan bog&apos;lanamiz.</p>
            ) : (
              <form className="product-detail-form-grid product-lead-form" onSubmit={submitLead}>
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
