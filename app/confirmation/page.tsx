'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ConfirmationPage() {
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

  const goHome = () => {
    router.push('/');
  };

  return (
    <>
      <style jsx>{`
        body {
          background-color: #f5f5f5;
          min-height: 100vh;
        }

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
          font-size: 13px;
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

        .blue-line {
          height: 4px;
          background-color: #0095ff;
        }

        .container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 100px 20px;
          min-height: calc(100vh - 150px);
        }

        .success-icon {
          width: 100px;
          height: 100px;
          background-color: #28a745;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 40px;
          box-shadow: 0 4px 20px rgba(40, 167, 69, 0.3);
        }

        .checkmark {
          width: 50px;
          height: 50px;
          border: 5px solid white;
          border-top: none;
          border-right: none;
          transform: rotate(-45deg);
          margin-top: -10px;
          margin-left: -5px;
        }

        .confirmation-title {
          font-size: 36px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 20px;
        }

        .reference-id {
          font-size: 16px;
          color: #666;
          margin-bottom: 40px;
        }

        .home-btn {
          padding: 14px 40px;
          background-color: #d5d5d5;
          border: none;
          border-radius: 6px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          color: #555;
          transition: background-color 0.3s ease;
        }

        .home-btn:hover {
          background-color: #c5c5c5;
        }

        @media (max-width: 768px) {
          .header {
            padding: 15px 20px;
            flex-direction: column;
            gap: 15px;
          }

          .search-input {
            width: 200px;
          }

          .container {
            padding: 60px 20px;
          }

          .confirmation-title {
            font-size: 28px;
            text-align: center;
          }

          .success-icon {
            width: 80px;
            height: 80px;
          }

          .checkmark {
            width: 40px;
            height: 40px;
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
            placeholder=""
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
        <div className="success-icon">
          <div className="checkmark"></div>
        </div>

        <h1 className="confirmation-title">Booking Confirmed</h1>

        <p className="reference-id">Ref ID: HUF568SO</p>

        <button className="home-btn" onClick={goHome}>
          Back to Home
        </button>
      </div>
    </>
  );
}