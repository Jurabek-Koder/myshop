import PDFDocument from 'pdfkit';

function formatMoney(value) {
  return `${new Intl.NumberFormat('uz-UZ').format(Number(value) || 0)} so‘m`;
}

function line(doc, label, value) {
  doc.font('Helvetica-Bold').text(label, { continued: true });
  doc.font('Helvetica').text(` ${value}`);
}

export function buildSalaryReceiptPdf(receipt) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 48,
        info: {
          Title: `MyShop receipt ${receipt?.receipt_number || ''}`,
          Author: 'MyShop Accounting',
        },
      });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fillColor('#0f172a').fontSize(24).font('Helvetica-Bold').text('MyShop');
      doc.fillColor('#334155').fontSize(13).font('Helvetica').text('Ish haqi kvitansiyasi');
      doc.moveDown(1.2);

      doc.roundedRect(48, 106, 500, 94, 18).fillAndStroke('#f8fafc', '#cbd5e1');
      doc.fillColor('#0f172a').fontSize(16).font('Helvetica-Bold').text(receipt?.cycle?.type_label || 'To‘lov', 68, 128);
      doc.fillColor('#475569').fontSize(11).font('Helvetica').text(`Kvitansiya: ${receipt?.receipt_number || '—'}`, 68, 154);
      doc.text(`Holat: ${receipt?.cycle?.status_label || '—'}`, 68, 171);
      doc.text(`Sana: ${receipt?.payment?.paid_at || receipt?.created_at || '—'}`, 310, 154);
      doc.text(`Usul: ${receipt?.payment?.method || '—'}`, 310, 171);

      doc.moveDown(5);
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f172a').text('Xodim ma’lumotlari');
      doc.moveDown(0.6);
      line(doc, 'F.I.Sh.:', receipt?.employee?.full_name || '—');
      line(doc, 'Lavozimi:', receipt?.employee?.position_title || '—');
      line(doc, 'Telefon:', receipt?.employee?.phone || '—');
      line(doc, 'Oylik stavka:', formatMoney(receipt?.employee?.monthly_salary));

      doc.moveDown(1.1);
      doc.fontSize(14).font('Helvetica-Bold').text('To‘lov tafsilotlari');
      doc.moveDown(0.6);
      line(doc, 'Turi:', receipt?.cycle?.type_label || '—');
      line(doc, 'Davr:', `${receipt?.cycle?.month || '—'}.${receipt?.cycle?.year || '—'}`);
      line(doc, 'To‘langan summa:', formatMoney(receipt?.payment?.amount));
      line(doc, 'Sikl jami:', formatMoney(receipt?.cycle?.gross_amount));
      line(doc, 'Qolgan balans:', formatMoney(receipt?.cycle?.remaining_amount));
      line(doc, 'Muddat:', receipt?.cycle?.due_date || '—');

      if (receipt?.payment?.note) {
        doc.moveDown(1);
        doc.fontSize(13).font('Helvetica-Bold').text('Izoh');
        doc.moveDown(0.35);
        doc.font('Helvetica').fontSize(11).fillColor('#334155').text(receipt.payment.note, {
          width: 500,
        });
      }

      doc.moveDown(2);
      doc.roundedRect(48, doc.y, 500, 82, 18).fillAndStroke('#eff6ff', '#bfdbfe');
      doc.fillColor('#1d4ed8').fontSize(11).font('Helvetica-Bold').text('Tasdiq', 68, doc.y + 18);
      doc.fillColor('#0f172a').fontSize(11).font('Helvetica').text(
        'Ushbu kvitansiya MyShop Accounting tizimi tomonidan avtomatik generatsiya qilindi.',
        68,
        doc.y + 18,
        { width: 460 },
      );
      doc.text('Qo‘shimcha tekshiruv uchun accounting panelidagi receipt raqamini ishlating.', 68, doc.y + 38, {
        width: 460,
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
