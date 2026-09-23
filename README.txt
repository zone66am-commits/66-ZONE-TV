# كاس الخليج 27

## 1) GitHub Pages
ارفع `index.html` إلى مستودع GitHub وفعّل GitHub Pages.

## 2) تشغيل روابط HLS من HTTPS
روابط القنوات الأصلية في ملف M3U تستخدم HTTP، لذلك GitHub Pages (HTTPS) يمنعها بسبب Mixed Content.

انشر `worker.js` كـ Cloudflare Worker، ثم خذ رابط الـ Worker وضعه داخل `index.html` هنا:

```js
const HLS_PROXY = 'https://YOUR-WORKER.workers.dev/?url=';
```

بعدها ارفع `index.html` إلى GitHub من جديد.

> ملاحظة: الـ Worker يعيد توجيه روابط M3U8 وملفات الـ segments/keys اللازمة للبث.
> لا يمكن ضمان أن كل قناة ستبقى متاحة إذا توقف أو غيّر مزود البث المصدر.
