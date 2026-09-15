'use client';

// Consolidated position dashboard
import { useSession, signIn, signOut } from "next-auth/react";
import { SessionProvider } from "next-auth/react";
import { useState, useMemo, useEffect } from "react";
import Link from 'next/link';
import { countries } from "../config/countries";
import consolidationMap from "../config/consolidationMap.json";
import { convertToMT } from "../config/units";
import { consolidatedCategories } from '../config/consolidatedCategories';
import { gradeOrder } from '../config/gradeOrder';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// Helper to formats a YYYY-MM string to MMM-YY
const formatMonthHeader = (yyyyMm) => {
    // --- THIS IS THE FIX ---
    const [year, month] = yyyyMm.split('-');
    // --- END OF FIX ---
    const date = new Date(year, month - 1);
    const monthName = date.toLocaleString('default', { month: 'short' });
    const shortYear = year.slice(-2);
    return `${monthName}-${shortYear}`;
};

// Maps the backend's authMode ("app-only" | "delegated") to a human-readable
// label for the processing-status messages.
const formatAuthLabel = (authMode) => {
  if (authMode === 'app-only') return 'automated (app registration)';
  return 'interactive sign-in';
};

// Helper to formats numbers with parentheses for negatives and no decimals
const formatNumber = (value) => {
    if (typeof value !== 'number' || value === 0) return '-';
    const roundedValue = Math.round(value);
    if (roundedValue < 0) {
        return `(${Math.abs(roundedValue).toLocaleString()})`;
    }
    return roundedValue.toLocaleString();
};

const getConsolidatedGrade = (grade, coffeeType) => {
  const map = coffeeType === 'Robusta' ? consolidationMap.Robusta : consolidationMap.Arabica;
  return map[grade] || grade;
}

const toYearMonth = (date) => date ? date.slice(0, 7) : null;

const createPivotedTable = (data, applyConsolidation, coffeeType) => {
  if (!data || data.length === 0) return { headers: [], rows: [] };

  const today = new Date();
  const futureMonthsYyyyMm = [];
  for (let i = 0; i < 6; i++) {
    const date = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    futureMonthsYyyyMm.push(`${year}-${month}`);
  }
  
  const currentMonthStr = futureMonthsYyyyMm[0];
  const laterCutoffMonth = futureMonthsYyyyMm[5];

  const formattedMonthHeaders = futureMonthsYyyyMm.map(formatMonthHeader);
  const headers = ["Grade", "Stock", "Past Due", ...formattedMonthHeaders, "Forward", "Net"];
  
  const dataByGrade = {};
  const officialCategories = coffeeType === 'Robusta' ? consolidatedCategories.Robusta : consolidatedCategories.Arabica;
  
  let sortedGradeKeys = [];

  if (applyConsolidation) {
    sortedGradeKeys = officialCategories;
  } else {
    const seenGrades = new Set();
    data.forEach(row => {
        const gradeKey = row.grade;
        if (!seenGrades.has(gradeKey)) {
            seenGrades.add(gradeKey);
            sortedGradeKeys.push(gradeKey);
        }
    });
  }
  
  sortedGradeKeys.forEach(gradeKey => {
      dataByGrade[gradeKey] = { Grade: gradeKey, Stock: 0, "Past Due": 0, "Forward": 0, Net: 0 };
      futureMonthsYyyyMm.forEach(m => dataByGrade[gradeKey][m] = 0);
  });

  data.forEach(row => {
    const gradeKey = applyConsolidation ? getConsolidatedGrade(row.grade, row.coffeeType) : row.grade;
    if (!dataByGrade[gradeKey]) return;

    const gradeGroup = dataByGrade[gradeKey];
    const quantityInMT = convertToMT(row.quantity, row.unit);

    if (row.type === 'long') {
      gradeGroup.Stock += quantityInMT;
    } else if (row.type === 'short') {
      const saleMonthStr = toYearMonth(row.date);
      if (!saleMonthStr || saleMonthStr < currentMonthStr) {
        gradeGroup["Past Due"] += quantityInMT;
      } else if (futureMonthsYyyyMm.includes(saleMonthStr)) {
        gradeGroup[saleMonthStr] = (gradeGroup[saleMonthStr] || 0) + quantityInMT;
      } else if (saleMonthStr > laterCutoffMonth) {
        gradeGroup["Forward"] += quantityInMT;
      }
    }
  });
  
  let processedRows = sortedGradeKeys.map(gradeKey => {
    const row = dataByGrade[gradeKey];
    const newRow = { Grade: row.Grade, cells: {} };
    let runningStock = row.Stock;

    const shortsOrder = ["Past Due", ...futureMonthsYyyyMm, "Forward"];
    shortsOrder.forEach(key => {
        const shortValue = row[key] || 0;
        runningStock += shortValue;
        newRow.cells[key] = {
            value: shortValue,
            isNegativeStock: runningStock < 0,
        };
    });

    const totalShorts = shortsOrder.reduce((sum, key) => sum + (row[key] || 0), 0);
    
    newRow.cells["Stock"] = { value: row.Stock };
    newRow.cells["Net"] = { value: row.Stock + totalShorts };

    futureMonthsYyyyMm.forEach((yyyyMm, index) => {
        const mmmYy = formattedMonthHeaders[index];
        newRow.cells[mmmYy] = newRow.cells[yyyyMm];
        delete newRow.cells[yyyyMm];
    });

    return newRow;
  });

  // --- MODIFICATION START ---
  // Only filter out empty rows for detailed country views, not for the main consolidated view.
  if (!applyConsolidation) {
    processedRows = processedRows.filter(row => row.cells["Stock"].value !== 0 || row.cells["Net"].value !== 0);
  }
  // --- MODIFICATION END ---

  return { headers, rows: processedRows };
};

function PositionTable({ title, tableData, forPdf = false, showStockFootnote = false }) {
  if (!tableData || tableData.rows.length === 0) return null;

  // Calculate totals for the footer
  const totals = {};
  tableData.headers.forEach(header => {
    if (header !== 'Grade') {
      totals[header] = tableData.rows.reduce((sum, row) => sum + (row.cells[header]?.value || 0), 0);
    }
  });

  const numericColWidth = '100px';
  const isShortColumn = (header) => !['Grade', 'Stock', 'Net'].includes(header);

  // Get the last month header (which should be at index 8, right before "Forward")
  const lastMonthHeader = tableData.headers[8]; // This should be the 6th month

  // LOGIC: Calculate colors for the totals row based on running stock
  const totalColors = {};
  let runningTotalStock = totals['Stock'] || 0;
  
  if (typeof totals['Stock'] === 'number' && totals['Stock'] !== 0) {
      totalColors['Stock'] = totals['Stock'] > 0 ? '#2E7D32' : '#C62828';
  } else {
      totalColors['Stock'] = 'inherit';
  }
  
  const shortHeaders = tableData.headers.filter(isShortColumn);

  shortHeaders.forEach(header => {
      const shortValue = totals[header] || 0;
      runningTotalStock += shortValue;
      if (runningTotalStock < 0) {
          totalColors[header] = '#C62828';
      } else {
          totalColors[header] = '#212121';
      }
  });

  if (typeof totals['Net'] === 'number' && totals['Net'] !== 0) {
      totalColors['Net'] = totals['Net'] > 0 ? '#2E7D32' : '#C62828';
  } else {
      totalColors['Net'] = 'inherit';
  }

  return (
    <div style={{
      marginBottom: forPdf ? '32px' : '48px',
      background: 'white',
      borderRadius: forPdf ? '8px' : '12px',
      padding: forPdf ? '16px' : '24px',
      boxShadow: forPdf ? 'none' : '0 2px 8px rgba(0, 0, 0, 0.08)',
      fontFamily: '"Cervo Neue", sans-serif',
      maxWidth: '1400px',
    }}>
      <h3 style={{ 
        fontSize: forPdf ? '1rem' : '1.25rem', 
        fontWeight: '600', 
        marginBottom: '16px',
        color: '#51534a',
        fontFamily: '"Cervo Neue", sans-serif',
      }}>{title}</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ 
          borderCollapse: 'collapse', 
          fontSize: forPdf ? '0.75rem' : '0.875rem',
          width: '100%',
          maxWidth: '1200px',
          fontFamily: '"Cervo Neue", sans-serif',
        }}>
          <thead style={{ background: '#f5f5f5' }}>
            <tr>
              {tableData.headers.map((header) => {
                return (
                <th key={header} style={{ 
                  padding: forPdf ? '8px' : '12px', 
                  border: '1px solid white',
                  borderRight: header === 'Past Due' || header === lastMonthHeader ? '2px solid #d0d0d0' : '1px solid white',
                  borderLeft: header === 'Forward' ? '2px solid #d0d0d0' : '1px solid white',
                  textAlign: header === 'Grade' ? 'left' : 'center',
                  width: header === 'Grade' ? '200px' : numericColWidth,
                  maxWidth: header === 'Grade' ? '200px' : numericColWidth,
                  fontWeight: '600',
                  color: '#51534a',
                  fontSize: forPdf ? '0.65rem' : '0.75rem',
                  letterSpacing: '0.5px',
                  fontFamily: '"Cervo Neue", sans-serif',
                  whiteSpace: 'nowrap',
                }}>{header === 'Stock' && showStockFootnote ? `${header}*` : header}</th>
              )})}
            </tr>
          </thead>
          <tbody>
            {tableData.rows.map((row, rowIndex) => (
              <tr key={row.Grade} style={{
                  backgroundColor: rowIndex % 2 === 1 ? 'rgba(214, 210, 196, 0.2)' : 'transparent'
              }}>
                {tableData.headers.map((header) => {
                  const cell = row.cells[header];
                  const value = header === 'Grade' ? row.Grade : cell?.value;
                  const isNet = header === 'Net';
                  
                  let color = '#51534a';
                  if (typeof value === 'number' && value !== 0) {
                      if (isShortColumn(header)) {
                          color = cell?.isNegativeStock ? '#C62828' : '#51534a';
                      } else {
                          color = value > 0 ? '#2E7D32' : '#C62828';
                      }
                  }
                  
                  const displayValue = header === 'Grade' ? value : formatNumber(value);

                  return (
                    <td key={header} style={{ 
                      padding: forPdf ? '6px' : '12px', 
                      border: '1px solid white',
                      borderRight: header === 'Past Due' || header === lastMonthHeader ? '2px solid #d0d0d0' : '1px solid white',
                      borderLeft: header === 'Forward' ? '2px solid #d0d0d0' : '1px solid white',
                      textAlign: header === 'Grade' ? 'left' : 'right', 
                      color,
                      fontWeight: isNet ? '600' : '400',
                      whiteSpace: 'nowrap',
                      fontFamily: '"Cervo Neue", sans-serif',
                      fontSize: forPdf ? '0.7rem' : 'inherit',
                    }}>
                      {displayValue}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tfoot style={{fontWeight: '600', background: '#f5f5f5'}}>
            <tr>
              {tableData.headers.map(header => {
                const value = totals[header];
                const color = totalColors[header] || '#51534a';
                const displayValue = header === 'Grade' ? 'Total' : formatNumber(value);
                return (
                  <td key={header} style={{ 
                      padding: forPdf ? '6px' : '12px', 
                      border: '1px solid white', 
                      borderTop: '2px solid #d0d0d0',
                      borderRight: header === 'Past Due' || header === lastMonthHeader ? '2px solid #d0d0d0' : '1px solid white',
                      borderLeft: header === 'Forward' ? '2px solid #d0d0d0' : '1px solid white',
                      textAlign: header === 'Grade' ? 'left' : 'right', 
                      color,
                      whiteSpace: 'nowrap',
                      fontFamily: '"Cervo Neue", sans-serif',
                      fontSize: forPdf ? '0.7rem' : 'inherit',
                  }}>
                     {displayValue}
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      {showStockFootnote && (
        <p style={{
          fontSize: forPdf ? '0.65rem' : '0.75rem',
          color: '#968C83',
          marginTop: '8px',
          marginBottom: 0,
          fontFamily: '"Cervo Neue", sans-serif',
        }}>
          * Includes &quot;To Be Shipped Sold and Unsold Purchases&quot;
        </p>
      )}
    </div>
  );
}

function Dashboard() {
  const { data: session } = useSession();
  const [hasAccess, setHasAccess] = useState(null); // null = checking, false = locked, true = unlocked
  const [accessPassword, setAccessPassword] = useState('');
  const [accessError, setAccessError] = useState(null);
  const [isSubmittingAccess, setIsSubmittingAccess] = useState(false);
  const [allData, setAllData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [viewTitle, setViewTitle] = useState('');
  const [isConsolidatedView, setIsConsolidatedView] = useState(false);
  const [fetchStatuses, setFetchStatuses] = useState(null);
  const [unmappedGradesCount, setUnmappedGradesCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Re-check the access-password gate whenever sign-in state changes.
  useEffect(() => {
    if (!session) {
      setHasAccess(null);
      return;
    }
    let cancelled = false;
    fetch('/api/consolidated_position/checkAccess')
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setHasAccess(Boolean(data.hasAccess)); })
      .catch(() => { if (!cancelled) setHasAccess(false); });
    return () => { cancelled = true; };
  }, [session]);

  const handleAccessSubmit = async (e) => {
    e.preventDefault();
    setIsSubmittingAccess(true);
    setAccessError(null);
    try {
      const res = await fetch('/api/consolidated_position/verifyPassword', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: accessPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAccessPassword('');
        setHasAccess(true);
      } else {
        setAccessError(data.message || 'Incorrect password. Please try again.');
      }
    } catch (err) {
      setAccessError('Something went wrong. Please try again.');
    }
    setIsSubmittingAccess(false);
  };

  const handleSignOut = async () => {
    try {
      await fetch('/api/consolidated_position/clearAccess', { method: 'POST' });
    } catch (err) {
      // Ignore — signing out client-side still proceeds.
    }
    setHasAccess(null);
    signOut();
  };

  useEffect(() => {
    const timer = setInterval(() => {
      if (lastUpdated) {
        const now = new Date();
        const diff = Math.floor((now - lastUpdated) / 1000 / 60);
        if (diff < 1) {
          setLastUpdated(lastUpdated);
        } else {
          setLastUpdated(lastUpdated);
        }
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [lastUpdated]);

  const fetchCountryData = async (country) => {
    const response = await fetch("/api/consolidated_position/fetchSharepointFile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `Failed to fetch for ${country.name}`);
    }
    return response.json();
  };

  const handleFetchSingle = async (country) => {
    setIsLoading(true);
    setError(null);
    setAllData([]);
    setViewTitle(country.name);
    setIsConsolidatedView(false);
    setFetchStatuses(null);
    setUnmappedGradesCount(0);
    try {
      const { data, lastModifiedDateTime, authMode } = await fetchCountryData(country);
      let processedData = data;

      // --- DEBUGGING START ---
      console.log(`1. [handleFetchSingle] Fetched data for: ${country.name}`);
      console.log("Original Grades (first 5):", data.slice(0, 5).map(d => d.grade));
      // --- DEBUGGING END ---

      const countrySortOrder = gradeOrder[country.name.toLowerCase()];

      if (countrySortOrder) {
        // --- DEBUGGING START ---
        console.log(`2. [handleFetchSingle] Found custom sort order for ${country.name}.`);
        // --- DEBUGGING END ---

        const dataWithIndex = data.map((item, index) => ({ ...item, originalIndex: index }));

        const customSort = (a, b) => {
          const indexA = countrySortOrder.indexOf(a.grade);
          const indexB = countrySortOrder.indexOf(b.grade);

          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;
          return a.originalIndex - b.originalIndex;
        };

        processedData = dataWithIndex.sort(customSort);
        
        // --- DEBUGGING START ---
        console.log("Sorted Grades (first 5):", processedData.slice(0, 5).map(d => d.grade));
        // --- DEBUGGING END ---
      } else {
        // --- DEBUGGING START ---
        console.log(`2. [handleFetchSingle] No custom sort order for ${country.name}. Using default order.`);
        // --- DEBUGGING END ---
      }

      setAllData(processedData);
      setLastUpdated(new Date());
      const lastModified = new Date(lastModifiedDateTime).toLocaleString();
      const authLabel = formatAuthLabel(authMode);
      setFetchStatuses({ [country.name]: { status: 'Success', message: `✓ Processed successfully. (File modified: ${lastModified}, auth: ${authLabel})` } });
    } catch (err)
 {
      setError(err.message);
      setFetchStatuses({ [country.name]: { status: 'Failed', message: `✗ Failed: ${err.message}` } });
    }
    setIsLoading(false);
  };

  const handleFetchConsolidated = async () => {
    setIsLoading(true);
    setError(null);
    setAllData([]);
    setViewTitle('Consolidated Africa Position');
    setIsConsolidatedView(true);
    setFetchStatuses(null);
    setUnmappedGradesCount(0);
    const promises = countries.map(country => fetchCountryData(country));
    const results = await Promise.allSettled(promises);
    const successfulData = [];
    const statuses = {};
    results.forEach((result, index) => {
      const countryName = countries[index].name;
      if (result.status === 'fulfilled') {
        successfulData.push(...result.value.data);
        const lastModified = new Date(result.value.lastModifiedDateTime).toLocaleString();
        const authLabel = formatAuthLabel(result.value.authMode);
        statuses[countryName] = { status: 'Success', message: `✓ Processed successfully. (File modified: ${lastModified}, auth: ${authLabel})` };
      } else {
        statuses[countryName] = { status: 'Failed', message: `✗ Failed: ${result.reason.message}` };
      }
    });

    //----------- SORTING LOGIC ADDED HERE -----------
    const dataWithIndex = successfulData.map((item, index) => ({ ...item, originalIndex: index }));

    const customSort = (a, b) => {
      // Use the country name from the data row to find the correct sort order
      const countrySortOrder = gradeOrder[a.country.toLowerCase()];
      if (!countrySortOrder) return a.originalIndex - b.originalIndex; // No specific order, keep original

      const indexA = countrySortOrder.indexOf(a.grade);
      const indexB = countrySortOrder.indexOf(b.grade);

      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return a.originalIndex - b.originalIndex; // Fallback to original order
    };
    
    const sortedSuccessfulData = dataWithIndex.sort(customSort);
    //----------- END OF SORTING LOGIC -----------

    const allSourceGrades = Array.from(new Map(sortedSuccessfulData.map(item => [item.grade, item])).values());
    localStorage.setItem('allSourceGrades', JSON.stringify(allSourceGrades));
    const mappedArabica = Object.keys(consolidationMap.Arabica);
    const mappedRobusta = Object.keys(consolidationMap.Robusta);
    const allMapped = new Set([...mappedArabica, ...mappedRobusta]);
    let count = 0;
    allSourceGrades.forEach(item => {
        if (!allMapped.has(item.grade)) count++;
    });
    setUnmappedGradesCount(count);
    setFetchStatuses(statuses);
    setAllData(sortedSuccessfulData.flat()); // Use the sorted data
    setLastUpdated(new Date());
    setIsLoading(false);
  };

  const generateConsolidationMappingText = () => {
    let mappingText = 'CONSOLIDATION MAPPING RULES:\n\n';
    
    // Arabica mappings
    mappingText += 'ARABICA:\n';
    Object.entries(consolidationMap.Arabica).forEach(([specific, consolidated]) => {
      mappingText += `  ${specific} → ${consolidated}\n`;
    });
    
    // Robusta mappings
    mappingText += '\nROBUSTA:\n';
    Object.entries(consolidationMap.Robusta).forEach(([specific, consolidated]) => {
      mappingText += `  ${specific} → ${consolidated}\n`;
    });
    
    return mappingText;
  };

  // PDF Export

  const handleExportPdf = async (includeDetailed = false) => {
  setIsExportingPdf(true);
  setShowExportMenu(false);
  
  try {
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    let currentPage = 1;
    let totalPages = 1; // Will be updated after we know how many pages

    // Function to add branded header to each page
    const addBrandedHeader = (pageNum) => {
      // Add gradient background effect at top
      pdf.setFillColor(0, 118, 128); // Teal
      pdf.rect(0, 0, 297, 35, 'F');
      
      // Add secondary color accent
      pdf.setFillColor(151, 215, 0); // Green
      pdf.rect(0, 30, 297, 5, 'F');
      
      // Add logo placeholder (S in a box)
      pdf.setFillColor(151, 215, 0);
      pdf.roundedRect(15, 8, 14, 14, 2, 2, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(16);
      pdf.setFont(undefined, 'bold');
      pdf.text('S', 22, 18);
      
      // Add title
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(20);
      pdf.setFont(undefined, 'bold');
      pdf.text('Africa Position Report', 35, 18);
      
      pdf.setFontSize(12);
      pdf.setFont(undefined, 'normal');
      pdf.text('Coffee Trading Positions & Commitments', 35, 25);
      
      // Add generation info on the right
      pdf.setFontSize(10);
      pdf.text(`Generated: ${new Date().toLocaleDateString()}`, 220, 15);
      pdf.text(`User: ${session.user.name}`, 220, 21);
      
      // Reset text color for content
      pdf.setTextColor(0, 0, 0);
    };

    // Function to add page numbers
    const addPageNumber = (pageNum, total) => {
      pdf.setFontSize(9);
      pdf.setTextColor(150, 140, 131); // Warm gray
      pdf.text(`Page ${pageNum} of ${total}`, 148.5, 200, { align: 'center' });
      pdf.setTextColor(0, 0, 0);
    };

    // Add header to first page
    addBrandedHeader(1);
    
    let yPosition = 45;
    const pageBottom = 190; // Increased usable space
    const tableSpacing = 5; // Minimal spacing between tables

    // Store all rendered tables to calculate actual heights
    const renderedTables = [];

    // Batch render function for multiple tables
    const renderTableBatch = async (tables, startY) => {
      let currentY = startY;
      const tempElements = [];
      const tableHeights = [];

      // First, measure all tables
      for (const { tableData, title, showStockFootnote } of tables) {
        if (!tableData || tableData.rows.length === 0) continue;

        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.width = '1200px';
        tempDiv.style.background = 'white';
        document.body.appendChild(tempDiv);

        const { createRoot } = await import('react-dom/client');
        const root = createRoot(tempDiv);
        root.render(<PositionTable title={title} tableData={tableData} forPdf={true} showStockFootnote={!!showStockFootnote} />);
        
        await new Promise(resolve => setTimeout(resolve, 300));

        const canvas = await html2canvas(tempDiv, {
          scale: 2,
          logging: false,
          useCORS: true,
        });

        const imgWidth = 270;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        tableHeights.push({ 
          title, 
          height: imgHeight, 
          // --- CHANGE 1: Use JPEG with 85% quality ---
          canvas: canvas.toDataURL('image/jpeg', 0.85),
          width: imgWidth 
        });

        root.unmount();
        document.body.removeChild(tempDiv);
      }

      // Now render them optimally
      for (const table of tableHeights) {
        const spaceLeft = pageBottom - currentY;
        
        if (table.height > spaceLeft && currentY > 50) {
          currentPage++;
          pdf.addPage();
          addBrandedHeader(currentPage);
          currentY = 45;
        }

        // --- CHANGE 2: Tell jsPDF it's a 'JPEG' ---
        pdf.addImage(table.canvas, 'JPEG', 15, currentY, table.width, table.height);
        currentY += table.height + tableSpacing;
      }

      return currentY;
    };

    // Render consolidated tables together
    const consolidatedTables = [
      { tableData: consolidatedArabicaTable, title: 'Africa Consolidated Position - ARABICA' },
      { tableData: consolidatedRobustaTable, title: 'Africa Consolidated Position - ROBUSTA' }
    ];

    yPosition = await renderTableBatch(consolidatedTables, yPosition);

    // If detailed export, add individual country tables
    if (includeDetailed) {
      if (yPosition + 20 > pageBottom && yPosition > 50) {
        currentPage++;
        pdf.addPage();
        addBrandedHeader(currentPage);
        yPosition = 45;
      } else if (yPosition < pageBottom - 20) {
        yPosition += 5;
        pdf.setDrawColor(208, 208, 208);
        pdf.line(15, yPosition, 282, yPosition);
        yPosition += 5;
        
        pdf.setFontSize(14);
        pdf.setFont(undefined, 'bold');
        pdf.setTextColor(150, 140, 131);
        pdf.text('DETAILED COUNTRY POSITIONS', 148.5, yPosition + 5, { align: 'center' });
        pdf.setTextColor(0, 0, 0);
        pdf.setFont(undefined, 'normal');
        yPosition += 12;
      }

      // --- MODIFICATION START ---
      // The individualTables variable is now a single, sorted array.
      // We can pass it directly to the batch renderer.
      const batchSize = 3;
      for (let i = 0; i < individualTables.length; i += batchSize) {
        const batch = individualTables.slice(i, i + batchSize);
        yPosition = await renderTableBatch(batch, yPosition);
      }
      // --- MODIFICATION END ---
    }

    // Add processing status
    if (fetchStatuses) {
      const statusHeight = Object.keys(fetchStatuses).length * 6 + 20;
      
      if (yPosition + statusHeight > pageBottom && yPosition > 50) {
        currentPage++;
        pdf.addPage();
        addBrandedHeader(currentPage);
        yPosition = 45;
      } else if (yPosition < pageBottom - 10) {
        yPosition += 8;
      }

      pdf.setDrawColor(208, 208, 208);
      pdf.line(15, yPosition, 282, yPosition);
      yPosition += 6;

      pdf.setFontSize(12);
      pdf.setFont(undefined, 'bold');
      pdf.setTextColor(81, 83, 74);
      pdf.text('Processing Status', 15, yPosition);
      yPosition += 6;
      
      pdf.setFontSize(10);
      pdf.setFont(undefined, 'normal');
      
      Object.entries(fetchStatuses).forEach(([country, result]) => {
        if (result.status === 'Failed') {
          pdf.setTextColor(198, 40, 40);
        } else {
          pdf.setTextColor(46, 125, 50);
        }
        pdf.text(`${country}: ${result.message}`, 20, yPosition);
        yPosition += 5;
      });
      
      pdf.setTextColor(0, 0, 0);
    }

    totalPages = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      addPageNumber(i, totalPages);
    }

    pdf.setPage(totalPages);
    pdf.setDrawColor(151, 215, 0);
    pdf.setLineWidth(0.5);
    pdf.line(15, 190, 282, 190);
    
    pdf.setFontSize(8);
    pdf.setTextColor(150, 140, 131);
    pdf.text('© Sucafina Group - Confidential', 148.5, 195, { align: 'center' });

    const fileName = includeDetailed 
      ? `Africa_Position_Detailed_${new Date().toISOString().split('T')[0]}.pdf`
      : `Africa_Position_Consolidated_${new Date().toISOString().split('T')[0]}.pdf`;
    
    pdf.save(fileName);
  } catch (error) {
    console.error('PDF generation failed:', error);
    alert('Failed to generate PDF. Please try again.');
  }

  setIsExportingPdf(false);
};

  const arabicaData = useMemo(() => allData.filter(d => d.coffeeType === 'Arabica' || !d.coffeeType), [allData]);
  const robustaData = useMemo(() => allData.filter(d => d.coffeeType === 'Robusta'), [allData]);
  const consolidatedArabicaTable = useMemo(() => createPivotedTable(arabicaData, isConsolidatedView, 'Arabica'), [arabicaData, isConsolidatedView]);
  const consolidatedRobustaTable = useMemo(() => createPivotedTable(robustaData, isConsolidatedView, 'Robusta'), [robustaData, isConsolidatedView]);
  const singleCountryTables = useMemo(() => {
    if (isConsolidatedView || allData.length === 0) return [];
    const dataByCoffeeType = allData.reduce((acc, row) => {
        const type = row.coffeeType || 'Arabica';
        if (!acc[type]) acc[type] = [];
        acc[type].push(row);
        return acc;
    }, {});
    return Object.entries(dataByCoffeeType).map(([coffeeType, data]) => ({
        title: `${coffeeType} Position for ${viewTitle}`,
        tableData: createPivotedTable(data, false, coffeeType)
    }));
  }, [allData, isConsolidatedView, viewTitle]);
  const individualTables = useMemo(() => {
    if (!isConsolidatedView) return [];

    // --- NEW LOGIC START ---
    // 1. Define the desired country sort order
    // --- THIS IS THE MODIFIED LINE ---
    const countrySortOrder = ['Burundi', 'Rwanda', 'Uganda', 'Kenya', 'Ethiopia', 'Tanzania'];
    // --- END OF MODIFICATION ---

    // 2. Group data by country first, then by coffee type
    const dataByCountry = allData.reduce((acc, row) => {
      const countryName = row.country;
      const coffeeType = row.coffeeType || 'Arabica';
      
      if (!acc[countryName]) acc[countryName] = {};
      if (!acc[countryName][coffeeType]) acc[countryName][coffeeType] = [];
      
      acc[countryName][coffeeType].push(row);
      return acc;
    }, {});

    // 3. Create a sorted list of tables
    const sortedTables = [];
    countrySortOrder.forEach(countryName => {
      if (dataByCountry[countryName]) {
        // Add Arabica table if it exists
        if (dataByCountry[countryName]['Arabica']) {
          sortedTables.push({
            title: `Detailed Arabica Position - ${countryName.toUpperCase()}`,
            tableData: createPivotedTable(dataByCountry[countryName]['Arabica'], false, 'Arabica'),
            showStockFootnote: countryName === 'Ethiopia'
          });
        }
        // Add Robusta table if it exists
        if (dataByCountry[countryName]['Robusta']) {
          sortedTables.push({
            title: `Detailed Robusta Position - ${countryName.toUpperCase()}`,
            tableData: createPivotedTable(dataByCountry[countryName]['Robusta'], false, 'Robusta'),
            showStockFootnote: countryName === 'Ethiopia'
          });
        }
      }
    });
    
    return sortedTables;
    // --- NEW LOGIC END ---

  }, [allData, isConsolidatedView]);

  const formatLastUpdated = () => {
    if (!lastUpdated) return '';
    const now = new Date();
    const diff = Math.floor((now - lastUpdated) / 1000 / 60);
    if (diff < 1) return 'Just now';
    if (diff === 1) return '1 minute ago';
    if (diff < 60) return `${diff} minutes ago`;
    return lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  if (session && hasAccess === null) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #007680 0%, #51534a 100%)',
        fontFamily: '"Cervo Neue", sans-serif',
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          border: '3px solid rgba(255,255,255,0.4)',
          borderTopColor: 'white',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <style jsx>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (session && hasAccess === false) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #007680 0%, #51534a 100%)',
        fontFamily: '"Cervo Neue", sans-serif',
      }}>
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '48px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          textAlign: 'center',
          maxWidth: '400px',
          width: '100%',
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            margin: '0 auto 32px',
            background: 'linear-gradient(135deg, #97D700 0%, #6BCABA 100%)',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2.5rem',
            boxShadow: '0 4px 12px rgba(151, 215, 0, 0.3)',
          }}>🔒</div>
          <h2 style={{
            fontSize: '1.875rem',
            fontWeight: '600',
            color: '#51534a',
            marginBottom: '8px',
            fontFamily: '"Cervo Neue", sans-serif',
          }}>Restricted Access</h2>
          <p style={{
            fontSize: '0.9375rem',
            color: '#968C83',
            marginBottom: '32px',
            fontFamily: '"Cervo Neue", sans-serif',
          }}>
            Signed in as {session.user?.name}. Enter the access password to view positions.
          </p>
          <form onSubmit={handleAccessSubmit}>
            <input
              type="password"
              value={accessPassword}
              onChange={(e) => setAccessPassword(e.target.value)}
              placeholder="Access password"
              autoFocus
              style={{
                width: '100%',
                padding: '12px 16px',
                marginBottom: '16px',
                borderRadius: '8px',
                border: '1px solid #d0d0d0',
                fontSize: '1rem',
                fontFamily: '"Cervo Neue", sans-serif',
                boxSizing: 'border-box',
              }}
            />
            {accessError && (
              <p style={{
                color: '#C62828',
                fontSize: '0.875rem',
                marginBottom: '16px',
                fontFamily: '"Cervo Neue", sans-serif',
              }}>{accessError}</p>
            )}
            <button
              type="submit"
              disabled={isSubmittingAccess || !accessPassword}
              style={{
                width: '100%',
                padding: '14px 24px',
                background: isSubmittingAccess || !accessPassword ? '#ccc' : '#007680',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: '500',
                cursor: isSubmittingAccess || !accessPassword ? 'not-allowed' : 'pointer',
                fontFamily: '"Cervo Neue", sans-serif',
              }}
            >
              {isSubmittingAccess ? 'Checking...' : 'Unlock'}
            </button>
          </form>
          <button
            onClick={handleSignOut}
            style={{
              marginTop: '24px',
              background: 'none',
              border: 'none',
              color: '#968C83',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontFamily: '"Cervo Neue", sans-serif',
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (session && hasAccess) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
        fontFamily: '"Cervo Neue", sans-serif',
      }}>
        {/* Header */}
        <header style={{
          background: 'white',
          borderBottom: '1px solid #e0e0e0',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
        }}>
          <div style={{
            padding: '20px 32px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                background: '#97D700',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                color: 'white',
                fontSize: '1.2rem',
                fontFamily: '"Cervo Neue", sans-serif',
              }}>S</div>
              <div>
                <h1 style={{
                  fontSize: '1.5rem',
                  fontWeight: '600',
                  color: '#51534a',
                  margin: 0,
                  fontFamily: '"Cervo Neue", sans-serif',
                }}>Africa Position Dashboard</h1>
                <p style={{
                  fontSize: '0.875rem',
                  color: '#968C83',
                  margin: 0,
                  fontFamily: '"Cervo Neue", sans-serif',
                }}>Coffee Trading Positions & Commitments</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              {lastUpdated && (
                <div style={{
                  fontSize: '0.875rem',
                  color: '#968C83',
                  fontFamily: '"Cervo Neue", sans-serif',
                }}>
                  Last updated: {formatLastUpdated()}
                </div>
              )}
            </div>
          </div>

          {/* Action Bar */}
          <div style={{
            padding: '16px 32px',
            background: '#fafafa',
            borderTop: '1px solid #f0f0f0',
          }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button 
                  onClick={handleFetchConsolidated} 
                  disabled={isLoading}
                  style={{
                    padding: '10px 20px',
                    background: isLoading ? '#ccc' : '#007680',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '500',
                    fontSize: '0.875rem',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 2px 4px rgba(0, 118, 128, 0.2)',
                    fontFamily: '"Cervo Neue", sans-serif',
                  }}
                  onMouseEnter={(e) => !isLoading && (e.target.style.transform = 'translateY(-1px)')}
                  onMouseLeave={(e) => !isLoading && (e.target.style.transform = 'translateY(0)')}
                >
                  Consolidated Position
                </button>
                <div style={{ width: '1px', height: '24px', background: '#e0e0e0' }} />
                {countries.map((country) => (
                  <button 
                    key={country.name} 
                    onClick={() => handleFetchSingle(country)} 
                    disabled={isLoading}
                    style={{
                      padding: '10px 16px',
                      background: 'white',
                      color: '#51534a',
                      border: '1px solid #d0d0d0',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      fontFamily: '"Cervo Neue", sans-serif',
                    }}
                    onMouseEnter={(e) => {
                      if (!isLoading) {
                        e.target.style.background = '#97D700';
                        e.target.style.color = 'white';
                        e.target.style.borderColor = '#97D700';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'white';
                      e.target.style.color = '#51534a';
                      e.target.style.borderColor = '#d0d0d0';
                    }}
                  >
                    {country.name}
                  </button>
                ))}
              </div>
              
              {/* Export PDF Button with Dropdown */}
              {isConsolidatedView && allData.length > 0 && (
                <div style={{ position: 'relative' }}>
                  <button 
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    disabled={isExportingPdf}
                    style={{
                      padding: '10px 16px',
                      background: isExportingPdf ? '#ccc' : '#B9975B',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      cursor: isExportingPdf ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      fontFamily: '"Cervo Neue", sans-serif',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                    onMouseEnter={(e) => !isExportingPdf && (e.target.style.background = '#968C83')}
                    onMouseLeave={(e) => !isExportingPdf && (e.target.style.background = '#B9975B')}
                  >
                    {isExportingPdf ? (
                      <>
                        <span style={{
                          width: '14px',
                          height: '14px',
                          border: '2px solid white',
                          borderTopColor: 'transparent',
                          borderRadius: '50%',
                          display: 'inline-block',
                          animation: 'spin 1s linear infinite',
                        }} />
                        Exporting...
                      </>
                    ) : (
                      <>
                        📄 Export PDF
                        <span style={{ fontSize: '0.7rem' }}>▼</span>
                      </>
                    )}
                  </button>
                  
                  {showExportMenu && !isExportingPdf && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: '4px',
                      background: 'white',
                      border: '1px solid #d0d0d0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                      zIndex: 1000,
                      minWidth: '200px',
                    }}>
                      <button
                        onClick={() => handleExportPdf(false)}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          background: 'white',
                          border: 'none',
                          borderBottom: '1px solid #f0f0f0',
                          borderRadius: '8px 8px 0 0',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          fontFamily: '"Cervo Neue", sans-serif',
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => e.target.style.background = '#f5f5f5'}
                        onMouseLeave={(e) => e.target.style.background = 'white'}
                      >
                        📊 Consolidated Only
                        <div style={{ fontSize: '0.75rem', color: '#968C83', marginTop: '4px' }}>
                          Export summary tables only
                        </div>
                      </button>
                      <button
                        onClick={() => handleExportPdf(true)}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          background: 'white',
                          border: 'none',
                          borderRadius: '0 0 8px 8px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          fontFamily: '"Cervo Neue", sans-serif',
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => e.target.style.background = '#f5f5f5'}
                        onMouseLeave={(e) => e.target.style.background = 'white'}
                      >
                        📑 Detailed Report
                        <div style={{ fontSize: '0.75rem', color: '#968C83', marginTop: '4px' }}>
                          Include all country breakdowns
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main style={{ 
          padding: '32px', 
          fontFamily: '"Cervo Neue", sans-serif',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}>
          <div style={{ width: '100%', maxWidth: '1400px' }}>
            {isLoading && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '16px',
                background: 'white',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
              }}>
                <div style={{
                  width: '20px',
                  height: '20px',
                  border: '3px solid #007680',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }} />
                <p style={{ margin: 0, color: '#51534a', fontFamily: '"Cervo Neue", sans-serif' }}>Processing data for {viewTitle}...</p>
                <style jsx>{`
                  @keyframes spin {
                    to { transform: rotate(360deg); }
                  }
                `}</style>
              </div>
            )}

            {error && (
              <div style={{
                padding: '16px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                color: '#C62828',
                marginBottom: '24px',
                fontFamily: '"Cervo Neue", sans-serif',
              }}>
                <strong>Error:</strong> {error}
              </div>
            )}

            {fetchStatuses && (
              <div style={{
                marginBottom: '24px',
                padding: '16px',
                background: 'white',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                fontFamily: '"Cervo Neue", sans-serif',
                maxWidth: '1400px',
              }}>
                <h4 style={{ 
                  fontSize: '0.875rem', 
                  fontWeight: '600', 
                  color: '#51534a',
                  marginBottom: '12px',
                  fontFamily: '"Cervo Neue", sans-serif',
                }}>Processing Status</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Object.entries(fetchStatuses).map(([country, result]) => (
                    <div key={country} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '0.875rem',
                      fontFamily: '"Cervo Neue", sans-serif',
                    }}>
                      <span style={{
                        color: result.status === 'Failed' ? '#C62828' : '#2E7D32',
                        fontWeight: '500',
                      }}>{country}:</span>
                      <span style={{ color: '#968C83' }}>{result.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {allData.length > 0 && (
              <div>
                {isConsolidatedView && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    marginBottom: '24px',
                  }}>
                    <Link 
                      href="/consolidated_position/mapping"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 16px',
                        background: 'white',
                        border: '1px solid #d0d0d0',
                        borderRadius: '8px',
                        color: '#007680',
                        textDecoration: 'none',
                        fontSize: '0.875rem',
                        transition: 'all 0.2s',
                        cursor: 'pointer',
                        fontFamily: '"Cervo Neue", sans-serif',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#007680';
                        e.currentTarget.style.color = 'white';
                        e.currentTarget.style.borderColor = '#007680';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'white';
                        e.currentTarget.style.color = '#007680';
                        e.currentTarget.style.borderColor = '#d0d0d0';
                      }}
                    >
                      <span>⚙</span> Manage Consolidation Rules
                    </Link>
                    {unmappedGradesCount > 0 && (
                      <span style={{
                        padding: '4px 12px',
                        background: '#f86336',
                        color: 'white',
                        borderRadius: '16px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        fontFamily: '"Cervo Neue", sans-serif',
                      }}>
                        {unmappedGradesCount} Unmapped
                      </span>
                    )}
                  </div>
                )}

                {!isConsolidatedView && singleCountryTables.map(t => (
                  <PositionTable key={t.title} title={t.title} tableData={t.tableData} showStockFootnote={viewTitle === 'Ethiopia'} />
                ))}

                {isConsolidatedView && (
                  <>
                    {/* Applying new title format here */}
                    <PositionTable title="Africa Consolidated Position - ARABICA" tableData={consolidatedArabicaTable} />
                    <PositionTable title="Africa Consolidated Position - ROBUSTA" tableData={consolidatedRobustaTable} />
                    
                    {individualTables.length > 0 && (
                      <>
                        <div style={{
                          margin: '48px 0 24px',
                          padding: '0 24px',
                        }}>
                          <div style={{
                            height: '1px',
                            background: 'linear-gradient(90deg, transparent, #d0d0d0 20%, #d0d0d0 80%, transparent)',
                          }} />
                          <h2 style={{
                            fontSize: '1.125rem',
                            fontWeight: '600',
                            color: '#968C83',
                            textAlign: 'center',
                            margin: '24px 0',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            fontFamily: '"Cervo Neue", sans-serif',
                          }}>Detailed Country Positions</h2>
                        </div>
                        {/* Rendering the new sorted and grouped tables */}
                        {individualTables.map(t => <PositionTable key={t.title} title={t.title} tableData={t.tableData} showStockFootnote={t.showStockFootnote} />)}
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {!isLoading && allData.length === 0 && !error && (
              <div style={{
                textAlign: 'center',
                padding: '64px 32px',
                background: 'white',
                borderRadius: '12px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                fontFamily: '"Cervo Neue", sans-serif',
                maxWidth: '1400px',
              }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  margin: '0 auto 24px',
                  background: 'linear-gradient(135deg, #97D700 0%, #6BCABA 100%)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <span style={{ fontSize: '2rem', color: 'white' }}>☕</span>
                </div>
                <h3 style={{
                  fontSize: '1.5rem',
                  fontWeight: '600',
                  color: '#51534a',
                  marginBottom: '8px',
                  fontFamily: '"Cervo Neue", sans-serif',
                }}>Ready to Get Started</h3>
                <p style={{
                  fontSize: '1rem',
                  color: '#968C83',
                  marginBottom: '24px',
                  fontFamily: '"Cervo Neue", sans-serif',
                }}>Select a view above to load position data</p>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #007680 0%, #51534a 100%)',
      fontFamily: '"Cervo Neue", sans-serif',
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        padding: '48px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        textAlign: 'center',
        maxWidth: '400px',
        width: '100%',
      }}>
        <div style={{
          width: '80px',
          height: '80px',
          margin: '0 auto 32px',
          background: 'linear-gradient(135deg, #97D700 0%, #6BCABA 100%)',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 'bold',
          color: 'white',
          fontSize: '2.5rem',
          boxShadow: '0 4px 12px rgba(151, 215, 0, 0.3)',
          fontFamily: '"Cervo Neue", sans-serif',
        }}>S</div>
        <h2 style={{
          fontSize: '1.875rem',
          fontWeight: '600',
          color: '#51534a',
          marginBottom: '8px',
          fontFamily: '"Cervo Neue", sans-serif',
        }}>Africa Position Dashboard</h2>
        <p style={{
          fontSize: '1rem',
          color: '#968C83',
          marginBottom: '32px',
          fontFamily: '"Cervo Neue", sans-serif',
        }}>Please sign in to continue</p>
        <button 
          onClick={() => signIn("azure-ad")}
          style={{
            width: '100%',
            padding: '14px 24px',
            background: '#007680',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(0, 118, 128, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            fontFamily: '"Cervo Neue", sans-serif',
          }}
          onMouseEnter={(e) => {
            e.target.style.transform = 'translateY(-2px)';
            e.target.style.boxShadow = '0 6px 20px rgba(0, 118, 128, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = '0 4px 12px rgba(0, 118, 128, 0.2)';
          }}
        >
          <span style={{ fontSize: '1.25rem' }}>⊞</span>
          Sign in with Microsoft
        </button>
      </div>
    </div>
  );
}

export default function Home() {
    return (
        <SessionProvider>
            <Dashboard />
        </SessionProvider>
    );
}