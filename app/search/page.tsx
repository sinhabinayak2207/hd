'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';

const allExperiences = [
  { id: 1, title: 'Kayaking', location: 'Udupi', price: 999, image: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=500&h=300&fit=crop' },
  { id: 2, title: 'Kayaking', location: 'Udupi, Karnataka', price: 999, image: 'https://images.unsplash.com/photo-1535622952768-c1e37ebf64cc?w=500&h=300&fit=crop' },
  { id: 3, title: 'Kayaking', location: 'Udupi, Karnataka', price: 999, image: 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=500&h=300&fit=crop' },
  { id: 4, title: 'Nandi Hills Sunrise', location: 'Bangalore', price: 899, image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500&h=300&fit=crop' },
  { id: 5, title: 'Coffee Trail', location: 'Coorg', price: 1299, image: 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=500&h=300&fit=crop' },
  { id: 6, title: 'Boat Cruise', location: 'Sunderban', price: 999, image: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=500&h=300&fit=crop' },
  { id: 7, title: 'Bunjee Jumping', location: 'Manali', price: 999, image: 'https://images.unsplash.com/photo-1516738901171-8eb4fc13bd20?w=500&h=300&fit=crop' },
];

function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredExperiences, setFilteredExperiences] = useState(allExperiences);

  useEffect(() => {
    const query = searchParams.get('q');
    if (query) {
      setSearchQuery(query);
      filterExperiences(query);
    }
  }, [searchParams]);

  const filterExperiences = (query: string) => {
    if (!query.trim()) {
      setFilteredExperiences(allExperiences);
      return;
    }
    
    const lowerQuery = query.toLowerCase();
    const filtered = allExperiences.filter(exp => 
      exp.title.toLowerCase().includes(lowerQuery) ||
      exp.location.toLowerCase().includes(lowerQuery)
    );
    setFilteredExperiences(filtered);
  };

  const handleSearch = () => {
    if (searchQuery.trim()) {
      filterExperiences(searchQuery);
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
    } else {
      setFilteredExperiences(allExperiences);
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
          padding: 12px 20px;
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

        .container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 50px 80px;
        }

        .results-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 30px;
          margin-bottom: 100px;
        }

        .card {
          background: white;
          border-radius: 15px;
          overflow: hidden;
          box-shadow: 0 2px 10px rgba(0,0,0,0.08);
          transition: transform 0.3s ease, box-shadow 0.3s ease;
          cursor: pointer;
        }

        .card:hover {
          transform: translateY(-5px);
          box-shadow: 0 4px 20px rgba(0,0,0,0.12);
        }

        .card-image {
          width: 100%;
          height: 220px;
          object-fit: cover;
          display: block;
        }

        .card-content {
          padding: 25px;
          background-color: #F0F0F0;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }

        .card-title {
          font-size: 20px;
          font-weight: 600;
          color: #1a1a1a;
        }

        .location-tag {
          background-color: #e8e8e8;
          padding: 5px 14px;
          border-radius: 12px;
          font-size: 11px;
          color: #555;
          font-weight: 500;
          white-space: nowrap;
        }

        .card-description {
          color: #666;
          font-size: 14px;
          line-height: 1.6;
          margin-bottom: 20px;
        }

        .card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .price-container {
          display: flex;
          align-items: baseline;
          gap: 6px;
        }

        .price-label {
          font-size: 13px;
          color: #888;
          
        }

        .price {
          font-size: 24px;
          font-weight: 700;
          color: #1a1a1a;
        }

        .view-details-btn {
          background-color: #ffd700;
          border: none;
          padding: 10px 22px;
          border-radius: 5px;
          font-weight: 600;
          cursor: pointer;
          font-size: 13px;
          transition: background-color 0.3s ease;
        }

        .view-details-btn:hover {
          background-color: #ffed4e;
        }

        @media (max-width: 1200px) {
          .results-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .header {
            padding: 20px 40px;
          }
          .container {
            padding: 40px 40px;
          }
        }

        @media (max-width: 768px) {
          .results-grid {
            grid-template-columns: 1fr;
          }
          .header {
            padding: 15px 20px;
            flex-direction: column;
            gap: 15px;
          }
          .container {
            padding: 30px 20px;
          }
          .search-input {
            width: 250px;
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
        <div className="results-grid">
          {filteredExperiences.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#666' }}>
              <h2>No experiences found</h2>
              <p>Try searching for something else like "Kayaking", "Coffee", or "Bangalore"</p>
            </div>
          ) : (
            filteredExperiences.map((exp) => (
              <div key={exp.id} className="card" onClick={() => handleViewDetails(exp.title, exp.price, exp.location, exp.image)}>
                <img
                  src={exp.image}
                  alt={exp.title}
                  className="card-image"
                />
                <div className="card-content">
                  <div className="card-header">
                    <h3 className="card-title">{exp.title}</h3>
                    <span className="location-tag">{exp.location}</span>
                  </div>
                  <p className="card-description">
                    Curated small-group experience. Certified guide. Safety first with gear included.
                  </p>
                  <div className="card-footer">
                    <div className="price-container">
                      <span className="price-label">From</span>
                      <span className="price">₹{exp.price}</span>
                    </div>
                    <button className="view-details-btn" onClick={(e) => { e.stopPropagation(); handleViewDetails(exp.title, exp.price, exp.location, exp.image); }}>
                      View Details
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SearchPageContent />
    </Suspense>
  );
}