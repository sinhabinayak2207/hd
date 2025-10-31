'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';

function ExperienceDetailsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [selectedDate, setSelectedDate] = useState('Oct 22');
  const [selectedTime, setSelectedTime] = useState('');
  
  const title = searchParams.get('title') || 'Kayaking';
  const location = searchParams.get('location') || 'Udupi';
  const basePrice = parseInt(searchParams.get('price') || '999');
  const image = searchParams.get('image') || 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&h=500&fit=crop';

  const taxRate = 0.059;

  const subtotal = basePrice * quantity;
  const taxes = Math.round(subtotal * taxRate);
  const total = subtotal + taxes;

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

  const increaseQuantity = () => {
    setQuantity(quantity + 1);
  };

  const decreaseQuantity = () => {
    if (quantity > 1) {
      setQuantity(quantity - 1);
    }
  };

  const confirmBooking = () => {
    const params = new URLSearchParams({
      title,
      price: basePrice.toString(),
      location,
      image,
      date: selectedDate,
      time: selectedTime,
      quantity: quantity.toString(),
      subtotal: subtotal.toString(),
      taxes: taxes.toString(),
      total: total.toString()
    });
    router.push(`/checkout?${params.toString()}`);
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
          padding: 15px 80px;
          font-weight: 500;
        }

        .back-button:hover {
          color: #555;
        }

        .container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 30px 80px;
          display: grid;
          grid-template-columns: 1fr 400px;
          gap: 40px;
        }

        .main-content {
          display: flex;
          flex-direction: column;
          gap: 25px;
        }

        .hero-image {
          width: 100%;
          height: 400px;
          object-fit: cover;
          border-radius: 12px;
          
        }

        .title {
          font-size: 32px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 10px;
        }

        .description {
          font-size: 15px;
          color: #666;
          line-height: 1.6;
        }

        .section-title {
          font-size: 20px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 15px;
          margin-top: 10px;
        }

        .date-options {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .date-btn {
          padding: 10px 20px;
          border: 1px solid #ddd;
          background: white;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          color: #555;
          transition: all 0.3s ease;
        }

        .date-btn.selected {
          background-color: #ffd700;
          border-color: #ffd700;
          color: #1a1a1a;
          font-weight: 600;
        }

        .date-btn:hover {
          border-color: #ffd700;
        }

        .time-options {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .time-btn {
          padding: 10px 16px;
          border: 1px solid #ddd;
          background: white;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          color: #555;
          position: relative;
          transition: all 0.3s ease;
        }

        .time-btn .badge {
          font-size: 9px;
          font-weight: 600;
          margin-left: 6px;
          padding: 2px 6px;
          border-radius: 3px;
        }

        .time-btn .badge.left {
          background-color: #ff6b6b;
          color: white;
        }

        .time-btn .badge.sold-out {
          background-color: #999;
          color: white;
        }

        .time-btn.selected {
          background-color: #ffd700;
          border-color: #ffd700;
          color: #1a1a1a;
          font-weight: 600;
        }

        .time-btn:not(.disabled):hover {
          border-color: #ffd700;
        }

        .time-btn.disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .time-note {
          font-size: 12px;
          color: #888;
          margin-top: 8px;
        }

        .about-section {
          background-color: #e8e8e8;
          padding: 15px;
          border-radius: 8px;
          font-size: 13px;
          color: #666;
        }

        .sidebar {
          position: sticky;
          top: 20px;
          height: fit-content;
        }

        .price-card {
          background: white;
          border-radius: 12px;
          padding: 25px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.08);
        }

        .price-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
          font-size: 15px;
        }

        .price-row.subtotal {
          margin: 0;
          padding: 12px 0;
        }

        .price-row .label {
          color: #666;
        }

        .price-row .value {
          font-weight: 600;
          color: #1a1a1a;
        }

        .quantity-control {
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .quantity-btn {
          width: 28px;
          height: 28px;
          border: 1px solid #ddd;
          background: white;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #555;
        }

        .quantity-btn:hover {
          border-color: #999;
        }

        .quantity-value {
          font-weight: 600;
          min-width: 20px;
          text-align: center;
        }

        .total-row {
          font-size: 18px;
          font-weight: 700;
          padding: 15px 0;
          border-top: 1px solid #e0e0e0;
          margin-top: 10px;
        }

        .confirm-btn {
          width: 100%;
          padding: 14px;
          background-color: #ffd700;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 20px;
          color: #1a1a1a;
        }

        .confirm-btn:hover {
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
            padding: 15px 40px;
          }
          .sidebar {
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
          .hero-image {
            height: 250px;
          }
          .title {
            font-size: 24px;
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
        ← Details
      </button>

      <div className="container">
        <div className="main-content">
          <img
            src={image}
            alt={title}
            className="hero-image"
          />

          <h1 className="title">{title}</h1>

          <p className="description">
            Curated small-group experience. Certified guide. Safety first with gear included. Helmet
            and Life jackets along with an expert will accompany in {title.toLowerCase()}.
          </p>

          <div>
            <h2 className="section-title">Choose date</h2>
            <div className="date-options">
              {['Oct 22', 'Oct 23', 'Oct 24', 'Oct 25', 'Oct 26'].map((date) => (
                <button
                  key={date}
                  className={`date-btn ${selectedDate === date ? 'selected' : ''}`}
                  onClick={() => setSelectedDate(date)}
                >
                  {date}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h2 className="section-title">Choose time</h2>
            <div className="time-options">
              <button className={`time-btn ${selectedTime === '07:00 am' ? 'selected' : ''}`} onClick={() => setSelectedTime('07:00 am')}>
                07:00 am
                <span className="badge left">4 left</span>
              </button>
              <button className={`time-btn ${selectedTime === '9:00 am' ? 'selected' : ''}`} onClick={() => setSelectedTime('9:00 am')}>
                9:00 am
                <span className="badge left">2 left</span>
              </button>
              <button className={`time-btn ${selectedTime === '11:00 am' ? 'selected' : ''}`} onClick={() => setSelectedTime('11:00 am')}>
                11:00 am
                <span className="badge left">5 left</span>
              </button>
              <button className="time-btn disabled">
                1:00 pm
                <span className="badge sold-out">Sold out</span>
              </button>
            </div>
            <p className="time-note">All times are in IST (GMT +5:30)</p>
          </div>

          <div>
            <h2 className="section-title">About</h2>
            <div className="about-section">
              Scenic routes, trained guides, and safety briefing. Minimum age 10.
            </div>
          </div>
        </div>

        <div className="sidebar">
          <div className="price-card">
            <div className="price-row">
              <span className="label">Starts at</span>
              <span className="value">₹{basePrice}</span>
            </div>

            <div className="price-row">
              <span className="label">Quantity</span>
              <div className="quantity-control">
                <button className="quantity-btn" onClick={decreaseQuantity}>
                  −
                </button>
                <span className="quantity-value">{quantity}</span>
                <button className="quantity-btn" onClick={increaseQuantity}>
                  +
                </button>
              </div>
            </div>

            <div className="price-row subtotal">
              <span className="label">Subtotal</span>
              <span className="value">₹{subtotal}</span>
            </div>

            <div className="price-row">
              <span className="label">Taxes</span>
              <span className="value">₹{taxes}</span>
            </div>

            <div className="price-row total-row">
              <span className="label">Total</span>
              <span className="value">₹{total}</span>
            </div>

            <button className="confirm-btn" onClick={confirmBooking}>
              Confirm
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function ExperienceDetailsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ExperienceDetailsPageContent />
    </Suspense>
  );
}