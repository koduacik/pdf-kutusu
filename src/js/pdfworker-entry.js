// pdf.js işçisi, klasik (modül olmayan) betik olarak derlenir: Safari file:// altında
// blob adresinden modül işçi yüklemeyi reddediyor. İşçi kapsamında kendini başlatır;
// ana iş parçacığında yüklenirse globalThis.pdfjsWorker olarak durur (yedek yol).
export * from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
