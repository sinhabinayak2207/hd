'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';

function CheckoutPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [termsChecked, setTermsChecked] = useState(false);
  const [errors, setErrors] = useState({ name: '', email: '', terms: '' });
  
  const title = searchParams.get('title') || 'Kayaking';
  const location = searchParams.get('location') || 'Udupi';
  const date = searchParams.get('date') || '2025-10-22';
  const time = searchParams.get('time') || '09:00 am';
  const quantity = searchParams.get('quantity') || '1';
  const subtotal = searchParams.get('subtotal') || '999';
  const taxes = searchParams.get('taxes') || '59';
  const total = searchParams.get('total') || '958';

  const handleSearch = () => {
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const applyPromo = () => {
    if (promoCode.trim()) {
      // Promo code applied
    }
  };

  const processPayment = () => {
    const newErrors = { name: '', email: '', terms: '' };
    
    if (!fullName.trim()) {
      newErrors.name = 'Please enter your full name';
    }

    if (!email.trim()) {
      newErrors.email = 'Please enter your email';
    }

    if (!termsChecked) {
      newErrors.terms = 'Please agree to the terms and safety policy';
    }

    setErrors(newErrors);

    if (!newErrors.name && !newErrors.email && !newErrors.terms) {
      router.push('/confirmation');
    }
  };

  return (
    <>
      <style jsx>{`
        .header {
          background-color: #f5f5f5;
          padding: 15px 60px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          border-bottom: 1px solid #e0e0e0;
        }

        .logo-container {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
        }

        .logo {
          width: 45px;
          height: 45px;
          object-fit: contain;
        }

        .logo-text {
          color: #1a1a1a;
          font-size: 18px;
          font-weight: 600;
        }

        .logo-text span {
          display: block;
          font-size: 14px;
          font-weight: 400;
        }

        .search-container {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .search-input {
          padding: 12px 20px;
          width: 300px;
          border: none;
          border-radius: 5px;
          background-color: #e8e8e8;
          font-size: 14px;
        }

        .search-btn {
          padding: 12px 35px;
          background-color: #ffd700;
          border: none;
          border-radius: 5px;
          font-weight: 600;
          cursor: pointer;
          font-size: 14px;
        }

        .search-btn:hover {
          background-color: #ffed4e;
        }

        .back-button {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 16px;
          color: #1a1a1a;
          background: none;
          border: none;
          cursor: pointer;
          padding: 20px 80px;
          font-weight: 500;
        }

        .back-button:hover {
          color: #555;
        }

        .container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 20px 80px 60px;
          display: grid;
          grid-template-columns: 1fr 400px;
          gap: 40px;
        }

        .checkout-form {
          background: #EFEFEF;
          border: none;
          border-radius: 12px;
          padding: 35px;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 20px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
        }

        .form-group.full-width {
          grid-column: 1 / -1;
        }

        .form-label {
          font-size: 14px;
          color: #333;
          margin-bottom: 8px;
          font-weight: 500;
        }

        .form-input {
          padding: 15.4px 17.6px;
          border: none;
          background-color: #DDDDDD;
          border-radius: 6px;
          font-size: 14px;
          color: #666;
        }

        .form-input::placeholder {
          color: #999;
        }

        .form-input:focus {
          outline: 2px solid #ffd700;
          background-color: #f5f5f5;
        }

        .promo-row {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
        }

        .promo-input {
          flex: 1;
          padding: 15.4px 17.6px;
          border: none;
          background-color: #DDDDDD;
          border-radius: 6px;
          font-size: 14px;
          color: #666;
        }

        .apply-btn {
          padding: 14px 30px;
          background-color: #1a1a1a;
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          font-size: 14px;
        }

        .apply-btn:hover {
          background-color: #333;
        }

        .checkbox-container {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 10px;
        }

        .checkbox {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .checkbox-label {
          font-size: 13px;
          color: #666;
          cursor: pointer;
        }

        .summary-card {
          background: #e5e5e5;
          border-radius: 12px;
          padding: 30px;
          height: fit-content;
          position: sticky;
          top: 20px;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 0;
          font-size: 15px;
        }

        .summary-row .label {
          color: #555;
        }

        .summary-row .value {
          font-weight: 600;
          color: #1a1a1a;
        }

        .summary-divider {
          height: 1px;
          background-color: #ccc;
          margin: 20px 0;
        }

        .error-message {
          color: #dc3545;
          font-size: 12px;
          margin-top: 4px;
        }

        .total-row {
          font-size: 20px;
          font-weight: 700;
          padding: 15px 0 20px;
        }

        .pay-btn {
          width: 100%;
          padding: 16px;
          background-color: #ffd700;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          color: #1a1a1a;
        }

        .pay-btn:hover {
          background-color: #ffed4e;
        }

        @media (max-width: 1024px) {
          .container {
            grid-template-columns: 1fr;
            padding: 20px 40px;
          }
          .header {
            padding: 20px 40px;
          }
          .back-button {
            padding: 20px 40px;
          }
          .summary-card {
            position: static;
          }
        }

        @media (max-width: 768px) {
          .header {
            padding: 15px 20px;
            flex-direction: column;
            gap: 15px;
          }
          .container {
            padding: 20px;
          }
          .back-button {
            padding: 15px 20px;
          }
          .checkout-form {
            padding: 25px;
          }
          .form-row {
            grid-template-columns: 1fr;
          }
          .search-input {
            width: 200px;
          }
        }
      `}</style>

      <header className="header">
        <div className="logo-container" onClick={() => router.push('/')}>
          <img src="/download.jpg" alt="Highway Delite" className="logo" />
          <div className="logo-text">
            highway
            <span>delite</span>
          </div>
        </div>
        <div className="search-container">
          <input
            type="text"
            className="search-input"
            placeholder="Search experiences"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={handleKeyPress}
          />
          <button className="search-btn" onClick={handleSearch}>
            Search
          </button>
        </div>
      </header>

      <button className="back-button" onClick={() => router.back()}>
        ← Checkout
      </button>

      <div className="container">
        <div className="checkout-form">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Full name</label>
              <input
                type="text"
                className="form-input"
                placeholder="Your name"
                value={fullName}
                onChange={(e) => { setFullName(e.target.value); setErrors({...errors, name: ''}); }}
              />
              {errors.name && <div className="error-message">{errors.name}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-input"
                placeholder="Your email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErrors({...errors, email: ''}); }}
              />
              {errors.email && <div className="error-message">{errors.email}</div>}
            </div>
          </div>

          <div className="promo-row">
            <input
              type="text"
              className="promo-input"
              placeholder="Promo code"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
            />
            <button className="apply-btn" onClick={applyPromo}>
              Apply
            </button>
          </div>

          <div className="checkbox-container">
            <input
              type="checkbox"
              className="checkbox"
              id="termsCheckbox"
              checked={termsChecked}
              onChange={(e) => setTermsChecked(e.target.checked)}
            />
            <label className="checkbox-label" htmlFor="termsCheckbox">
              I agree to the terms and safety policy
            </label>
          </div>
          {errors.terms && <div className="error-message" style={{marginTop: '8px'}}>{errors.terms}</div>}
        </div>

        <div className="summary-card">
          <div className="summary-row">
            <span className="label">Experience</span>
            <span className="value">{title}</span>
          </div>
          <div className="summary-row">
            <span className="label">Date</span>
            <span className="value">{date}</span>
          </div>
          <div className="summary-row">
            <span className="label">Time</span>
            <span className="value">{time}</span>
          </div>
          <div className="summary-row">
            <span className="label">Qty</span>
            <span className="value">{quantity}</span>
          </div>

          <div className="summary-row">
            <span className="label">Subtotal</span>
            <span className="value">₹{subtotal}</span>
          </div>
          <div className="summary-row">
            <span className="label">Taxes</span>
            <span className="value">₹{taxes}</span>
          </div>

          <div className="summary-divider"></div>

          <div className="summary-row total-row">
            <span className="label">Total</span>
            <span className="value">₹{total}</span>
          </div>

          <button className="pay-btn" onClick={processPayment}>
            Pay and Confirm
          </button>
        </div>
      </div>
    </>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CheckoutPageContent />
    </Suspense>
  );
}