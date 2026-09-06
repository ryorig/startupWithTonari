const inquiryForm = document.getElementById('company-inquiry-form');
const inquirySuccess = document.getElementById('company-inquiry-success');

if (inquiryForm && inquirySuccess) {
  inquiryForm.addEventListener('submit', event => {
    event.preventDefault();

    const data = new FormData(inquiryForm);
    const company = data.get('company');
    const name = data.get('name');
    const email = data.get('email');
    const message = data.get('message');
    const subject = encodeURIComponent(`[隣の高専生] 法人企業様からのご相談：${company}`);
    const body = encodeURIComponent(
      `会社名：${company}\nお名前：${name}\nメールアドレス：${email}\n\nご相談内容：\n${message}`
    );

    window.location.href = `mailto:nakamotoryoke@gmail.com?subject=${subject}&body=${body}`;
    inquiryForm.hidden = true;
    inquirySuccess.hidden = false;
    inquirySuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}
