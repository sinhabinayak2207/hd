'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function HomePage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

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

  const handleViewDetails = (title: string, price: number, location: string, image: string) => {
    const params = new URLSearchParams({
      title,
      price: price.toString(),
      location,
      image
    });
    router.push(`/details?${params.toString()}`);
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
          padding: 10px 20px;
          width: 300px;
          border: none;
          border-radius: 5px;
          background-color: #e8e8e8;
          font-size: 14px;
        }

        .search-input::placeholder {
          color: #888;
        }

        .search-btn {
          padding: 10px 30px;
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

        .container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 40px 60px;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 25px;
        }

        .card {
          background: #f8f8f8;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          transition: transform 0.3s ease, box-shadow 0.3s ease;
          position: relative;
          cursor: pointer;
        }

        .card:hover {
          transform: translateY(-5px);
          box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        }

        .card-image {
          width: 100%;
          height: 200px;
          object-fit: cover;
          display: block;
        }

        .card-content {
          padding: 20px;
          background-color: #F0F0F0;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .card-title {
          font-size: 18px;
          font-weight: 600;
          color: #1a1a1a;
        }

        .location-tag {
          background-color: #e8e8e8;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 11px;
          color: #555;
          font-weight: 500;
        }

        .card-description {
          color: #666;
          font-size: 13px;
          line-height: 1.5;
          margin-bottom: 15px;
          min-height: 42px;
        }

        .card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .price-container {
          display: flex;
          align-items: baseline;
          gap: 5px;
        }

        .price-label {
          font-size: 12px;
          color: black;
          font-weight: 700;
        }

        .price {
          font-size: 22px;
          font-weight: 700;
          color: #1a1a1a;
        }

        .view-details-btn {
          background-color: #ffd700;
          border: none;
          padding: 8px 18px;
          border-radius: 5px;
          font-weight: 600;
          cursor: pointer;
          font-size: 13px;
          transition: background-color 0.3s ease;
        }

        .view-details-btn:hover {
          background-color: #ffed4e;
        }

        .dimension-badge {
          position: absolute;
          top: 10px;
          left: 10px;
          background-color: #0095ff;
          color: white;
          padding: 6px 12px;
          border-radius: 5px;
          font-size: 12px;
          font-weight: 600;
        }

        .border-highlight {
          
        }

        @media (max-width: 1200px) {
          .grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        @media (max-width: 900px) {
          .grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 600px) {
          .grid {
            grid-template-columns: 1fr;
          }
          .header {
            padding: 15px 20px;
            flex-direction: column;
            gap: 15px;
          }
          .container {
            padding: 20px;
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

      <div className="container">
        <div className="grid">
          {/* Card 1 - Kayaking (with border) */}
          <div className="card border-highlight" onClick={() => handleViewDetails('Kayaking', 999, 'Udupi', 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&h=250&fit=crop')}>
            <img
              src="https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&h=250&fit=crop"
              alt="Kayaking"
              className="card-image"
            />
            <div className="card-content">
              <div className="card-header">
                <h3 className="card-title">Kayaking</h3>
                <span className="location-tag">Udupi</span>
              </div>
              <p className="card-description">
                Curated small-group experience. Certified guide. Safety first with gear included.
              </p>
              <div className="card-footer">
                <div className="price-container">
                  <span className="price-label">From</span>
                  <span className="price">₹999</span>
                </div>
                <button className="view-details-btn" onClick={(e) => { e.stopPropagation(); handleViewDetails('Kayaking', 999, 'Udupi', 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&h=250&fit=crop'); }}>
                  View Details
                </button>
              </div>
            </div>
          </div>

          {/* Card 2 - Nandi Hills Sunrise */}
          <div className="card" onClick={() => handleViewDetails('Nandi Hills Sunrise', 899, 'Bangalore', 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=250&fit=crop')}>
            <img
              src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=250&fit=crop"
              alt="Nandi Hills Sunrise"
              className="card-image"
            />
            <div className="card-content">
              <div className="card-header">
                <h3 className="card-title">Nandi Hills Sunrise</h3>
                <span className="location-tag">Bangalore</span>
              </div>
              <p className="card-description">
                Curated small-group experience. Certified guide. Safety first with gear included.
              </p>
              <div className="card-footer">
                <div className="price-container">
                  <span className="price-label">From</span>
                  <span className="price">₹899</span>
                </div>
                <button className="view-details-btn" onClick={(e) => { e.stopPropagation(); handleViewDetails('Nandi Hills Sunrise', 899, 'Bangalore', 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=250&fit=crop'); }}>
                  View Details
                </button>
              </div>
            </div>
          </div>

          {/* Card 3 - Coffee Trail */}
          <div className="card" onClick={() => handleViewDetails('Coffee Trail', 1299, 'Coorg', 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=400&h=250&fit=crop')}>
            <img
              src="https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=400&h=250&fit=crop"
              alt="Coffee Trail"
              className="card-image"
            />
            <div className="card-content">
              <div className="card-header">
                <h3 className="card-title">Coffee Trail</h3>
                <span className="location-tag">Coorg</span>
              </div>
              <p className="card-description">
                Curated small-group experience. Certified guide. Safety first with gear included.
              </p>
              <div className="card-footer">
                <div className="price-container">
                  <span className="price-label">From</span>
                  <span className="price">₹1299</span>
                </div>
                <button className="view-details-btn" onClick={(e) => { e.stopPropagation(); handleViewDetails('Coffee Trail', 1299, 'Coorg', 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=400&h=250&fit=crop'); }}>
                  View Details
                </button>
              </div>
            </div>
          </div>

          {/* Card 4 - Kayaking */}
          <div className="card" onClick={() => handleViewDetails('Kayaking', 999, 'Udupi, Karnataka', 'https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=400&h=250&fit=crop')}>
            <img
              src="https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=400&h=250&fit=crop"
              alt="Kayaking"
              className="card-image"
            />
            <div className="card-content">
              <div className="card-header">
                <h3 className="card-title">Kayaking</h3>
                <span className="location-tag">Udupi, Karnataka</span>
              </div>
              <p className="card-description">
                Curated small-group experience. Certified guide. Safety first with gear included.
              </p>
              <div className="card-footer">
                <div className="price-container">
                  <span className="price-label">From</span>
                  <span className="price">₹999</span>
                </div>
                <button className="view-details-btn" onClick={(e) => { e.stopPropagation(); handleViewDetails('Kayaking', 999, 'Udupi, Karnataka', 'https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=400&h=250&fit=crop'); }}>
                  View Details
                </button>
              </div>
            </div>
          </div>

          {/* Card 5 - Nandi Hills Sunrise (with badge) */}
          <div className="card" onClick={() => handleViewDetails('Nandi Hills Sunrise', 899, 'Bangalore', 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=400&h=250&fit=crop')}>
            
            <img
              src="https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=400&h=250&fit=crop"
              alt="Nandi Hills Sunrise"
              className="card-image"
            />
            <div className="card-content">
              <div className="card-header">
                <h3 className="card-title">Nandi Hills Sunrise</h3>
                <span className="location-tag">Bangalore</span>
              </div>
              <p className="card-description">
                Curated small-group experience. Certified guide. Safety first with gear included.
              </p>
              <div className="card-footer">
                <div className="price-container">
                  <span className="price-label"><b>From</b></span>
                  <span className="price">₹899</span>
                </div>
                <button className="view-details-btn" onClick={(e) => { e.stopPropagation(); handleViewDetails('Nandi Hills Sunrise', 899, 'Bangalore', 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=400&h=250&fit=crop'); }}>
                  View Details
                </button>
              </div>
            </div>
          </div>

          {/* Card 6 - Boat Cruise */}
          <div className="card" onClick={() => handleViewDetails('Boat Cruise', 999, 'Sunderban', 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=400&h=250&fit=crop')}>
            <img
              src="https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=400&h=250&fit=crop"
              alt="Boat Cruise"
              className="card-image"
            />
            <div className="card-content">
              <div className="card-header">
                <h3 className="card-title">Boat Cruise</h3>
                <span className="location-tag">Sunderban</span>
              </div>
              <p className="card-description">
                Curated small-group experience. Certified guide. Safety first with gear included.
              </p>
              <div className="card-footer">
                <div className="price-container">
                  <span className="price-label">From</span>
                  <span className="price">₹999</span>
                </div>
                <button className="view-details-btn" onClick={(e) => { e.stopPropagation(); handleViewDetails('Boat Cruise', 999, 'Sunderban', 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=400&h=250&fit=crop'); }}>
                  View Details
                </button>
              </div>
            </div>
          </div>

          {/* Card 7 - Bunjee Jumping */}
          <div className="card" onClick={() => handleViewDetails('Bunjee Jumping', 999, 'Manali', 'https://images.unsplash.com/photo-1516738901171-8eb4fc13bd20?w=400&h=250&fit=crop')}>
            <img
              src="https://images.unsplash.com/photo-1516738901171-8eb4fc13bd20?w=400&h=250&fit=crop"
              alt="Bunjee Jumping"
              className="card-image"
            />
            <div className="card-content">
              <div className="card-header">
                <h3 className="card-title">Bunjee Jumping</h3>
                <span className="location-tag">Manali</span>
              </div>
              <p className="card-description">
                Curated small-group experience. Certified guide. Safety first with gear included.
              </p>
              <div className="card-footer">
                <div className="price-container">
                  <span className="price-label">From</span>
                  <span className="price">₹999</span>
                </div>
                <button className="view-details-btn" onClick={(e) => { e.stopPropagation(); handleViewDetails('Bunjee Jumping', 999, 'Manali', 'https://images.unsplash.com/photo-1516738901171-8eb4fc13bd20?w=400&h=250&fit=crop'); }}>
                  View Details
                </button>
              </div>
            </div>
          </div>

          {/* Card 8 - Coffee Trail */}
          <div className="card" onClick={() => handleViewDetails('Coffee Trail', 1299, 'Coorg', 'https://images.unsplash.com/photo-1511884642898-4c92249e20b6?w=400&h=250&fit=crop')}>
            <img
              src="https://images.unsplash.com/photo-1511884642898-4c92249e20b6?w=400&h=250&fit=crop"
              alt="Coffee Trail"
              className="card-image"
            />
            <div className="card-content">
              <div className="card-header">
                <h3 className="card-title">Coffee Trail</h3>
                <span className="location-tag">Coorg</span>
              </div>
              <p className="card-description">
                Curated small-group experience. Certified guide. Safety first with gear included.
              </p>
              <div className="card-footer">
                <div className="price-container">
                  <span className="price-label">From</span>
                  <span className="price">₹1299</span>
                </div>
                <button className="view-details-btn" onClick={(e) => { e.stopPropagation(); handleViewDetails('Coffee Trail', 1299, 'Coorg', 'https://images.unsplash.com/photo-1511884642898-4c92249e20b6?w=400&h=250&fit=crop'); }}>
                  View Details
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}