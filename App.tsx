
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { decodeVin, searchParts, compareParts } from './services/openaiService';
import { VehicleData, PartResult, SearchStatus, SearchStep, GarageVehicle } from './types';
import { ICONS, ENTERTAINMENT_DATA } from './constants';

const ENTERTAINMENT_ROTATE_INTERVAL = 10000; 

// Helper to extract numeric value from price strings (e.g., "$123.45" -> 123.45)
const parsePrice = (priceStr?: string): number => {
  if (!priceStr || priceStr.toLowerCase().includes('unknown')) return Infinity;
  const cleaned = priceStr.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? Infinity : parsed;
};

const App: React.FC = () => {
  const [vin, setVin] = useState('');
  const [partQuery, setPartQuery] = useState('');
  const [vehicleData, setVehicleData] = useState<VehicleData | null>(null);
  const [results, setResults] = useState<PartResult[]>([]);
  const [status, setStatus] = useState<SearchStatus>({ step: 'idle', message: 'Ready to scan.' });
  const [garage, setGarage] = useState<GarageVehicle[]>([]);
  const [editingVehicle, setEditingVehicle] = useState<GarageVehicle | null>(null);
  const [isManualEntryModalOpen, setIsManualEntryModalOpen] = useState(false);
  const [manualVehicle, setManualVehicle] = useState<Partial<GarageVehicle>>({
    make: '',
    model: '',
    year: new Date().getFullYear().toString(),
    trim: '',
    engine: '',
    bodyClass: '',
    vin: 'MANUAL_ENTRY'
  });

  // Comparison State
  const [selectedPartUrls, setSelectedPartUrls] = useState<Set<string>>(new Set());
  const [isComparisonModalOpen, setIsComparisonModalOpen] = useState(false);
  const [comparisonData, setComparisonData] = useState<string | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  const entertainmentIntervalRef = useRef<number | null>(null);

  // Load garage from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('findmypart_garage');
    if (saved) {
      try {
        setGarage(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse garage from storage", e);
      }
    }
  }, []);

  // Save garage whenever it changes
  useEffect(() => {
    localStorage.setItem('findmypart_garage', JSON.stringify(garage));
  }, [garage]);
  
  const updateEntertainment = useCallback(() => {
    const random = Math.random();
    let type: 'facts' | 'jokes' | 'trivia';
    let prefix = '';

    if (random < 0.33) {
      type = 'facts';
      prefix = 'Did you know?';
    } else if (random < 0.66) {
      type = 'jokes';
      prefix = 'Mechanic Humor:';
    } else {
      type = 'trivia';
      prefix = 'Auto Trivia:';
    }

    const pool = ENTERTAINMENT_DATA[type];
    const item = pool[Math.floor(Math.random() * pool.length)];
    
    setStatus(prev => ({
      ...prev,
      entertainment: `${prefix} ${item}`
    }));
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vin || !partQuery) return;

    setResults([]);
    setSelectedPartUrls(new Set());
    setVehicleData(null);
    updateEntertainment();
    
    if (entertainmentIntervalRef.current) clearInterval(entertainmentIntervalRef.current);
    entertainmentIntervalRef.current = window.setInterval(updateEntertainment, ENTERTAINMENT_ROTATE_INTERVAL);

    try {
      const vehicle = await decodeVin(vin, (step, message) => {
        setStatus(prev => ({ ...prev, step, message }));
      });
      
      setVehicleData(vehicle);

      setStatus(prev => ({ 
        ...prev,
        step: 'searching', 
        message: `Querying global inventory for ${vehicle.year} ${vehicle.make} ${vehicle.model} parts...` 
      }));

      const partResults = await searchParts(vehicle, partQuery);
      
      // Sort results by price low to high
      const sortedResults = [...partResults].sort((a, b) => {
        const priceA = parsePrice(a.price);
        const priceB = parsePrice(b.price);
        return priceA - priceB;
      });

      if (entertainmentIntervalRef.current) {
        clearInterval(entertainmentIntervalRef.current);
        entertainmentIntervalRef.current = null;
      }

      setResults(sortedResults);
      setStatus(prev => ({ ...prev, step: 'complete', message: 'Search complete. Results sorted by price.' }));
    } catch (error: any) {
      console.error(error);
      if (entertainmentIntervalRef.current) {
        clearInterval(entertainmentIntervalRef.current);
        entertainmentIntervalRef.current = null;
      }
      setStatus({ 
        step: 'error', 
        message: error.message || 'An error occurred during the search. Please check your VIN.' 
      });
    }
  };

  const handleClear = () => {
    setVin('');
    setPartQuery('');
    setVehicleData(null);
    setResults([]);
    setSelectedPartUrls(new Set());
    setStatus({ step: 'idle', message: 'Ready to scan.' });
    if (entertainmentIntervalRef.current) {
      clearInterval(entertainmentIntervalRef.current);
      entertainmentIntervalRef.current = null;
    }
  };

  const handleAddToGarage = () => {
    if (!vehicleData || !vin) return;
    
    const isAlreadySaved = garage.some(v => v.vin === vin && vin !== 'MANUAL_ENTRY');
    if (isAlreadySaved) {
      alert("This vehicle is already in your garage.");
      return;
    }

    const newVehicle: GarageVehicle = {
      ...vehicleData,
      id: crypto.randomUUID(),
      vin: vin,
      savedAt: Date.now()
    };

    setGarage(prev => [newVehicle, ...prev]);
  };

  const removeFromGarage = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setGarage(prev => prev.filter(v => v.id !== id));
  };

  const handleEditVehicle = (vehicle: GarageVehicle, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingVehicle({ ...vehicle });
  };

  const saveEditedVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVehicle) return;

    setGarage(prev => prev.map(v => v.id === editingVehicle.id ? editingVehicle : v));
    
    if (vehicleData && vin === editingVehicle.vin && editingVehicle.vin !== 'MANUAL_ENTRY') {
      setVehicleData(editingVehicle);
    } else if (vehicleData && vehicleData === editingVehicle) {
       setVehicleData(editingVehicle);
    }

    setEditingVehicle(null);
  };

  const handleManualEntrySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualVehicle.make || !manualVehicle.model || !manualVehicle.year) return;

    const newVehicle: GarageVehicle = {
      make: manualVehicle.make,
      model: manualVehicle.model,
      year: manualVehicle.year,
      trim: manualVehicle.trim || '',
      engine: manualVehicle.engine || '',
      bodyClass: manualVehicle.bodyClass || '',
      vin: manualVehicle.vin || `MANUAL_${Date.now()}`,
      id: crypto.randomUUID(),
      savedAt: Date.now()
    };

    setGarage(prev => [newVehicle, ...prev]);
    setIsManualEntryModalOpen(false);
    loadFromGarage(newVehicle);
  };

  const loadFromGarage = (vehicle: GarageVehicle) => {
    setVin(vehicle.vin === 'MANUAL_ENTRY' ? '' : (vehicle.vin.startsWith('MANUAL_') ? '' : vehicle.vin));
    setVehicleData(vehicle);
    setResults([]);
    setSelectedPartUrls(new Set());
    setStatus({ step: 'idle', message: `Loaded ${vehicle.make} ${vehicle.model} from your garage.` });
  };

  const togglePartSelection = (url: string) => {
    setSelectedPartUrls(prev => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });
  };

  
const handleCompareParts = async () => {
  const selectedParts = results.filter(r => selectedPartUrls.has(r.url));
  if (selectedParts.length < 2) {
    alert("Select at least 2 parts to compare.");
    return;
  }
  if (!vehicleData) {
    alert("Decode a VIN or select a vehicle first.");
    return;
  }

  setIsComparing(true);
  setIsComparisonModalOpen(true);
  setComparisonData(null);

  try {
    const { markdown } = await compareParts(vehicleData, selectedParts);
    setComparisonData(markdown);
  } catch (error: any) {
    console.error("Comparison failed:", error);
    setComparisonData(`Comparison failed: ${error?.message || String(error)}`);
  } finally {
    setIsComparing(false);
  }
};

  const getReportIssueUrl = () => {
    const subject = encodeURIComponent("FindMyPart.AI - Issue Report");
    const body = encodeURIComponent(
      `Diagnostic Report:\n\n` +
      `VIN: ${vin || 'Not Provided'}\n` +
      `Query: ${partQuery || 'Not Provided'}\n` +
      `Current Step: ${status.step}\n` +
      `Last Message: ${status.message}\n` +
      `Vehicle Found: ${vehicleData ? `${vehicleData.year} ${vehicleData.make} ${vehicleData.model}` : 'None'}\n\n` +
      `Please describe the issue below:\n`
    );
    return `mailto:support@autopartfinder.ai?subject=${subject}&body=${body}`;
  };

  const isProcessing = ['verifying', 'accessing_nhtsa', 'ai_cross_ref', 'finalizing', 'searching'].includes(status.step);
  const isInGarage = vehicleData && garage.some(v => v.vin === vin && vin !== '' && !vin.startsWith('MANUAL_'));

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto space-y-8">
      {/* Comparison Modal */}
      {isComparisonModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <ICONS.Search />
                Part Comparison Analysis
              </h3>
              <button 
                onClick={() => setIsComparisonModalOpen(false)}
                className="p-2 hover:bg-slate-800 rounded-full text-slate-500 hover:text-slate-300 transition-all"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-slate-900/30">
              {isComparing ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-6">
                  <div className="w-12 h-12 border-4 border-blue-600/30 border-t-blue-500 rounded-full animate-spin" />
                  <div className="text-center">
                    <p className="text-lg font-bold text-slate-200">Generating AI Comparison...</p>
                    <p className="text-sm text-slate-500">Cross-referencing technical specifications and pricing.</p>
                  </div>
                </div>
              ) : (
                <div className="prose prose-invert max-w-none">
                  {comparisonData ? (
                    <div className="space-y-4">
                       <div className="text-slate-300 whitespace-pre-wrap leading-relaxed font-mono text-sm">
                         {comparisonData}
                       </div>
                    </div>
                  ) : (
                    <p className="text-red-400">Failed to load comparison data.</p>
                  )}
                </div>
              )}
            </div>
            <div className="p-6 bg-slate-950/50 border-t border-slate-800 flex justify-end">
              <button 
                onClick={() => setIsComparisonModalOpen(false)}
                className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl transition-all"
              >
                Close Comparison
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <form 
            onSubmit={saveEditedVehicle}
            className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
          >
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <ICONS.Edit />
                Edit Vehicle Details
              </h3>
              <button 
                type="button" 
                onClick={() => setEditingVehicle(null)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Make</label>
                  <input 
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 text-slate-100"
                    value={editingVehicle.make}
                    onChange={e => setEditingVehicle({...editingVehicle, make: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Model</label>
                  <input 
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 text-slate-100"
                    value={editingVehicle.model}
                    onChange={e => setEditingVehicle({...editingVehicle, model: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Year</label>
                  <input 
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 text-slate-100"
                    value={editingVehicle.year}
                    onChange={e => setEditingVehicle({...editingVehicle, year: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Trim</label>
                  <input 
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 text-slate-100"
                    value={editingVehicle.trim || ''}
                    onChange={e => setEditingVehicle({...editingVehicle, trim: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Engine</label>
                <input 
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 text-slate-100"
                  value={editingVehicle.engine || ''}
                  onChange={e => setEditingVehicle({...editingVehicle, engine: e.target.value})}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Body Class</label>
                <input 
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 text-slate-100"
                  value={editingVehicle.bodyClass || ''}
                  onChange={e => setEditingVehicle({...editingVehicle, bodyClass: e.target.value})}
                />
              </div>
            </div>
            <div className="p-6 bg-slate-950/50 border-t border-slate-800 flex justify-end gap-3">
              <button 
                type="button" 
                onClick={() => setEditingVehicle(null)}
                className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg transition-all shadow-lg shadow-blue-900/20"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Manual Entry Modal */}
      {isManualEntryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <form 
            onSubmit={handleManualEntrySubmit}
            className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
          >
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <ICONS.Plus />
                Add Vehicle Manually
              </h3>
              <button 
                type="button" 
                onClick={() => setIsManualEntryModalOpen(false)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Make*</label>
                  <input 
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 text-slate-100"
                    placeholder="e.g. Ford"
                    value={manualVehicle.make}
                    onChange={e => setManualVehicle({...manualVehicle, make: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Model*</label>
                  <input 
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 text-slate-100"
                    placeholder="e.g. F-150"
                    value={manualVehicle.model}
                    onChange={e => setManualVehicle({...manualVehicle, model: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Year*</label>
                  <input 
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 text-slate-100"
                    placeholder="e.g. 2023"
                    value={manualVehicle.year}
                    onChange={e => setManualVehicle({...manualVehicle, year: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Trim</label>
                  <input 
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 text-slate-100"
                    placeholder="e.g. Lariat"
                    value={manualVehicle.trim}
                    onChange={e => setManualVehicle({...manualVehicle, trim: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Engine Displacement / Power</label>
                <input 
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 text-slate-100"
                  placeholder="e.g. 5.0L V8 400HP"
                  value={manualVehicle.engine}
                  onChange={e => setManualVehicle({...manualVehicle, engine: e.target.value})}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Body Class</label>
                <input 
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 text-slate-100"
                  placeholder="e.g. Pickup Truck"
                  value={manualVehicle.bodyClass}
                  onChange={e => setManualVehicle({...manualVehicle, bodyClass: e.target.value})}
                />
              </div>
            </div>
            <div className="p-6 bg-slate-950/50 border-t border-slate-800 flex justify-end gap-3">
              <button 
                type="button" 
                onClick={() => setIsManualEntryModalOpen(false)}
                className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg transition-all shadow-lg shadow-blue-900/20"
              >
                Add to Garage
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col md:flex-row items-center justify-between border-b border-slate-700 pb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-600 rounded-lg shadow-lg shadow-blue-900/20">
            <ICONS.Car />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">FindMyPart<span className="text-blue-500">.AI</span></h1>
            <p className="text-slate-400 text-sm">Smart VIN decoding and part sourcing</p>
          </div>
        </div>
        <div className="text-right flex flex-col items-end gap-1">
          <div className="flex items-center gap-4">
            <a 
              href={getReportIssueUrl()}
              className="text-[10px] font-bold text-slate-500 hover:text-blue-400 transition-colors uppercase tracking-widest flex items-center gap-1 border border-slate-700/50 px-2 py-1 rounded"
              title="Report an issue with this search or decoding."
            >
              Report Issue
            </a>
            <p className="text-xs font-mono text-slate-500">SYSTEM STATUS: <span className="text-green-500">OPERATIONAL</span></p>
          </div>
          <p className="text-xs font-mono text-slate-500">ENGINE: OPENAI</p>
        </div>
      </header>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Sidebar */}
        <aside className="lg:col-span-4 space-y-6">
          <form onSubmit={handleSearch} className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 space-y-6 sticky top-8">
            <div className="space-y-2 relative group">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Vehicle VIN</label>
                <button 
                  type="button"
                  onClick={() => setIsManualEntryModalOpen(true)}
                  className="text-[10px] font-bold text-blue-500 hover:text-blue-400 uppercase tracking-tighter flex items-center gap-1 transition-colors"
                >
                  <ICONS.Plus />
                  Add Manually
                </button>
              </div>
              <input 
                type="text"
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase())}
                placeholder="17-Digit VIN Number"
                maxLength={17}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-100 font-mono focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-600"
                required={!vehicleData || vin !== ''}
              />
            </div>

            <div className="space-y-2 relative group">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Requested Parts</label>
              <textarea 
                value={partQuery}
                onChange={(e) => setPartQuery(e.target.value)}
                placeholder="e.g. Brake rotors, air filter, timing belt..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-100 min-h-[100px] focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-600"
                required
              />
            </div>

            <div className="space-y-3">
              <button 
                type="submit"
                disabled={isProcessing}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Searching...</span>
                  </>
                ) : (
                  <>
                    <ICONS.Search />
                    <span>Initiate Global Search</span>
                  </>
                )}
              </button>

              <button 
                type="button"
                onClick={handleClear}
                disabled={isProcessing}
                className="w-full bg-slate-900/50 hover:bg-slate-900 border border-slate-700 text-slate-400 hover:text-slate-200 font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <ICONS.Trash />
                <span>Clear All Inputs</span>
              </button>
            </div>

            {status.step !== 'idle' && (
              <div className="pt-4 border-t border-slate-700/50">
                <div className="flex items-center gap-2 text-blue-400 text-sm mb-2">
                  <ICONS.Info />
                  <span className="font-semibold uppercase tracking-tight">Status Update</span>
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">{status.message}</p>
              </div>
            )}
          </form>

          {/* Garage Section */}
          <div className="bg-slate-800/30 rounded-2xl border border-slate-700 overflow-hidden">
            <div className="p-4 bg-slate-800/50 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <ICONS.Garage />
                My Garage
              </h3>
              <span className="text-[10px] font-mono text-slate-500">{garage.length}/10</span>
            </div>
            <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
              {garage.length > 0 ? (
                <div className="divide-y divide-slate-700/50">
                  {garage.map((car) => (
                    <div 
                      key={car.id} 
                      onClick={() => loadFromGarage(car)}
                      className="p-3 hover:bg-slate-700/30 cursor-pointer transition-colors group relative"
                    >
                      <div className="flex justify-between items-start pr-12">
                        <div className="space-y-0.5">
                          <p className="text-sm font-bold text-slate-200">{car.year} {car.make} {car.model}</p>
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                            {car.engine && <p className="text-[10px] text-blue-400/80 font-semibold uppercase">{car.engine}</p>}
                            {car.bodyClass && <p className="text-[10px] text-slate-500 uppercase">{car.bodyClass}</p>}
                          </div>
                          <p className="text-[9px] font-mono text-slate-600 mt-1">{car.vin.startsWith('MANUAL_') ? 'MANUAL ENTRY' : car.vin}</p>
                        </div>
                      </div>
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => handleEditVehicle(car, e)}
                          className="p-2 text-slate-600 hover:text-blue-400 transition-colors"
                          title="Edit vehicle details"
                        >
                          <ICONS.Edit />
                        </button>
                        <button 
                          onClick={(e) => removeFromGarage(car.id, e)}
                          className="p-2 text-slate-600 hover:text-red-400 transition-colors"
                          title="Remove from garage"
                        >
                          <ICONS.Trash />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <p className="text-xs text-slate-500 italic">No vehicles saved yet.</p>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Results Main Area */}
        <main className="lg:col-span-8 space-y-8">
          {isProcessing && (
            <div className="bg-slate-800 border-2 border-blue-500/30 p-8 rounded-2xl relative overflow-hidden animate-pulse-slow">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <ICONS.Wrench />
              </div>
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-blue-500 h-full transition-all duration-1000" 
                    style={{ 
                      width: status.step === 'verifying' ? '15%' : 
                             status.step === 'accessing_nhtsa' ? '35%' : 
                             status.step === 'ai_cross_ref' ? '60%' : 
                             status.step === 'finalizing' ? '85%' : '95%' 
                    }} 
                  />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-blue-400 uppercase tracking-widest text-sm">Step: {status.step.replace('_', ' ')}</h3>
                  <p className="text-slate-400 italic text-lg font-medium px-4">
                    "{status.entertainment}"
                  </p>
                </div>
              </div>
            </div>
          )}

          {vehicleData && (
            <div className="bg-slate-800/30 rounded-2xl border border-slate-700 p-6 space-y-6 animate-in slide-in-from-bottom-2 duration-300">
              <div className="flex flex-col md:flex-row gap-6 items-start">
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 shrink-0 self-center md:self-start">
                  <div className="w-24 h-24 bg-blue-900/20 rounded-lg flex items-center justify-center text-blue-500">
                    <ICONS.Car />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-4 w-full">
                  <InfoItem label="Make" value={vehicleData.make} />
                  <InfoItem label="Model" value={vehicleData.model} />
                  <InfoItem label="Year" value={vehicleData.year} />
                  <InfoItem label="Trim" value={vehicleData.trim || 'N/A'} />
                  <div className="col-span-2">
                    <InfoItem label="Engine Specifications" value={vehicleData.engine || 'Unknown'} />
                  </div>
                  <div className="col-span-2">
                    <InfoItem label="Body Configuration" value={vehicleData.bodyClass || 'Standard'} />
                  </div>
                </div>
              </div>

              {!isProcessing && status.step !== 'idle' && (
                <div className="pt-4 border-t border-slate-700/50 flex justify-end">
                  <button 
                    onClick={handleAddToGarage}
                    disabled={isInGarage}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                      isInGarage 
                        ? 'bg-slate-700 text-slate-500 cursor-default' 
                        : 'bg-slate-800 hover:bg-slate-700 text-blue-400 border border-blue-500/20'
                    }`}
                  >
                    <ICONS.Bookmark />
                    {isInGarage ? 'Saved in Garage' : 'Save to My Garage'}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="space-y-4 pb-20">
            {results.length > 0 ? (
              <>
                <div className="flex items-center justify-between px-2">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <span className="text-blue-500">●</span> Available Matches
                  </h2>
                  <div className="flex items-center gap-4">
                    {selectedPartUrls.size >= 2 && (
                      <button 
                        onClick={handleCompareParts}
                        disabled={isComparing}
                        className={`bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 px-4 rounded-full shadow-lg shadow-blue-900/40 animate-in fade-in slide-in-from-right-4 transition-all flex items-center gap-2 ${isComparing ? 'opacity-70 cursor-wait animate-pulse' : ''}`}
                      >
                        {isComparing ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          `Compare Selected (${selectedPartUrls.size})`
                        )}
                      </button>
                    )}
                    <span className="text-xs font-mono text-slate-500">{results.length} PART(S) LOCATED</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {results.map((result, idx) => (
                    <ResultCard 
                      key={idx} 
                      result={result} 
                      onToggleSelect={togglePartSelection}
                      isSelected={selectedPartUrls.has(result.url)}
                    />
                  ))}
                </div>
              </>
            ) : status.step === 'complete' ? (
              <div className="text-center py-20 bg-slate-800/20 rounded-2xl border border-dashed border-slate-700">
                <p className="text-slate-500 font-medium">No precise matches found for your criteria.</p>
                <p className="text-slate-600 text-sm mt-2 px-6 max-w-md mx-auto">Try broadening your search term.</p>
              </div>
            ) : (status.step === 'idle' || status.step === 'error') && (
              <div className={`text-center py-20 bg-slate-800/20 rounded-2xl border border-dashed ${status.step === 'error' ? 'border-red-900/50' : 'border-slate-700'}`}>
                <div className={`mb-4 ${status.step === 'error' ? 'text-red-500' : 'text-slate-600'} flex justify-center`}>
                  {status.step === 'error' ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                  ) : (
                    <ICONS.Wrench />
                  )}
                </div>
                {status.step === 'error' ? (
                  <div className="px-6">
                    <h3 className="text-red-400 font-bold text-lg uppercase tracking-tight">System Diagnostic Error</h3>
                    <p className="text-slate-500 text-sm mt-2 max-w-sm mx-auto">{status.message}</p>
                    <button 
                      onClick={() => setStatus({ step: 'idle', message: 'Ready to scan.' })}
                      className="mt-6 text-xs text-blue-500 hover:text-blue-400 font-bold uppercase tracking-widest border border-blue-500/20 px-4 py-2 rounded-full transition-all"
                    >
                      Reset System
                    </button>
                  </div>
                ) : (
                  <>
                    <h3 className="text-slate-400 font-medium text-lg">Enter a VIN or Load from Garage to begin</h3>
                    <p className="text-slate-600 text-sm mt-1">Our AI will cross-reference global catalogs in seconds.</p>
                  </>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      <style>{`
        @keyframes progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }
      `}</style>
    </div>
  );
};

const InfoItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="space-y-1">
    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">{label}</p>
    <p className="text-slate-200 font-semibold">{value}</p>
  </div>
);

const ResultCard: React.FC<{ 
  result: PartResult; 
  onToggleSelect: (url: string) => void;
  isSelected: boolean;
}> = ({ result, onToggleSelect, isSelected }) => (
  <div className={`group bg-slate-800/40 hover:bg-slate-800 border transition-all duration-300 p-5 rounded-2xl flex gap-4 ${isSelected ? 'border-blue-500 bg-slate-800' : 'border-slate-700'}`}>
    <div className="pt-1">
      <button 
        onClick={() => onToggleSelect(result.url)}
        className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
          isSelected ? 'bg-blue-600 border-blue-600' : 'bg-slate-900 border-slate-700 hover:border-slate-500'
        }`}
      >
        {isSelected && (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        )}
      </button>
    </div>
    <div className="flex-1">
      <div className="flex justify-between items-start gap-4 mb-3">
        <div className="flex-1">
          <h3 className="font-bold text-lg text-slate-100 group-hover:text-blue-400 transition-colors">{result.title}</h3>
          <p className="text-xs text-slate-500 font-mono flex items-center gap-1 mt-1">
            SOURCE: <span className="text-slate-400 uppercase">{result.source}</span>
          </p>
        </div>
        {result.price && (
          <span className="bg-green-500/10 text-green-400 px-3 py-1 rounded-full text-sm font-bold border border-green-500/20 whitespace-nowrap">
            {result.price}
          </span>
        )}
      </div>
      <p className="text-slate-400 text-sm leading-relaxed mb-4 line-clamp-2">
        {result.snippet}
      </p>
      <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-700/50">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-4">
            <a 
              href={result.url} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-blue-500 hover:text-blue-400 text-sm font-bold flex items-center gap-2 transition-colors"
            >
              View Listing
              <ICONS.ExternalLink />
            </a>
            <a 
              href={result.url} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-1.5 px-4 rounded-lg transition-all shadow-md shadow-green-900/20 flex items-center gap-2"
            >
              Buy Now
            </a>
          </div>
          <button 
            onClick={() => onToggleSelect(result.url)}
            className={`text-xs font-bold px-2 py-1 rounded transition-colors ${
              isSelected ? 'text-blue-400 bg-blue-500/10' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {isSelected ? 'Remove from Comparison' : 'Add to Compare'}
          </button>
        </div>
        <span className="text-[10px] text-slate-600 font-mono tracking-tighter hidden md:block">REF_ID: {Math.random().toString(36).substr(2, 9).toUpperCase()}</span>
      </div>
    </div>
  </div>
);

export default App;
