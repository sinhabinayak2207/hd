'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface HeaderProps {
  variant?: 'dark' | 'light' | 'confirmation';
  searchValue?: string;
}

export default function Header({ variant = 'dark', searchValue = '' }: HeaderProps) {
  const [search, setSearch] = useState(searchValue);
  const router = useRouter();

  const handleSearch = () => {
    if (search.trim()) {
      router.push(`/search?q=${encodeURIComponent(search)}`);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const isDark = variant === 'dark';
  const isConfirmation = variant === 'confirmation';

  return (
    <>
      <header
        className={`${
          isDark ? 'bg-[#1a1a1a]' : isConfirmation ? 'bg-white' : 'bg-[#f5f5f5]'
        } px-[60px] py-[15px] md:px-[80px] md:py-[20px] flex justify-between items-center ${
          !isDark ? 'border-b border-[#e0e0e0]' : ''
        } shadow-sm animate-slideDown max-md:flex-col max-md:gap-4 max-md:px-5`}
      >
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <div
            className={`flex items-center gap-2.5 ${
              isConfirmation ? 'p-2 px-3 border-2 border-dashed border-[#0095ff] rounded-lg' : ''
            }`}
          >
            <div
              className={`w-10 h-10 ${
                isDark ? 'bg-white text-[#1a1a1a]' : 'bg-[#1a1a1a] text-white'
              } rounded-full flex items-center justify-center font-bold text-sm md:w-[45px] md:h-[45px] md:text-base`}
            >
              HD
            </div>
            <div className={`${isDark ? 'text-white' : 'text-[#1a1a1a]'} text-lg font-semibold md:text-[18px]`}>
              highway
              <span className="block text-sm font-normal md:text-[14px]">delite</span>
            </div>
          </div>
        </Link>

        <div
          className={`flex gap-2.5 items-center ${
            isConfirmation ? 'border-2 border-dashed border-[#0095ff] rounded-lg overflow-hidden' : ''
          }`}
        >
          <input
            type="text"
            className={`px-5 py-2.5 md:py-3 w-[250px] md:w-[300px] border-none rounded-md ${
              isDark || isConfirmation ? 'bg-[#e8e8e8]' : 'bg-[#e8e8e8]'
            } text-sm outline-none placeholder:text-[#888] focus:ring-2 focus:ring-[#ffd700] transition-all ${
              isConfirmation ? 'rounded-none bg-white' : ''
            }`}
            placeholder={searchValue || 'Search experiences'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyPress={handleKeyPress}
          />
          <button
            onClick={handleSearch}
            className={`px-[30px] md:px-[35px] py-2.5 md:py-3 bg-[#ffd700] border-none ${
              isConfirmation ? 'rounded-none' : 'rounded-md'
            } font-semibold cursor-pointer text-sm hover:bg-[#ffed4e] transition-all active:scale-95`}
          >
            Search
          </button>
        </div>
      </header>
      {isConfirmation && <div className="h-1 bg-[#0095ff]"></div>}
    </>
  );
}
