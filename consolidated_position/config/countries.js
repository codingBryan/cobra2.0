// config/countries.js
export const countries = [
  {
    name: "Burundi",
    url: "https://sucafina0.sharepoint.com/:x:/r/sites/Bucafe/_layouts/15/Doc.aspx?sourcedoc=%7BC5BF81BB-78F3-4954-AFF6-1A533A1AE25E%7D",
    config: {
      recapSheet: "Burundi Recap",
      scheduleSheet: "Burundi Schedule",
      unit: "MT",
    }
  },
  {
    name: "Rwanda",
    url: "https://sucafina0.sharepoint.com/:x:/r/sites/RWACOF/_layouts/15/Doc.aspx?sourcedoc=%7B22DD084D-F104-4034-8A7A-02F618552728%7D",
    config: {
      sheetName: "Summary",
      unit: "KGs",
      layout: {
        longs: [
          { cropYear: '25', startCell: 'B35' },
          { cropYear: '26', startCell: 'B51' }
        ],
        shorts: [
          { cropYear: '25', startCell: 'AM28', monthHeaderRow: 26 }
        ]
      }
    }
  },
  {
    name: "Uganda",
    url: "https://sucafina0-my.sharepoint.com/:x:/r/personal/sny_sucafina_com/_layouts/15/Doc.aspx?sourcedoc=%7B5D17C3E8-7A4D-479A-A052-CA5FE3018A29%7D",
    config: {
      sheetName: "Monthly Summary",
      unit: "MT",
      layout: {
        netShortsRobusta: { startCell: 'B3', gradeCol: 'B', stockCols: ['C', 'D', 'E'], pastDueCol: 'F', monthHeaderRow: 2, monthStartCol: 'G' },
        netShortsArabica: { startCell: 'B17', gradeCol: 'B', stockCols: ['C', 'D', 'E'], pastDueCol: 'F', monthHeaderRow: 16, monthStartCol: 'G' },
        purchasesRobusta: { startCell: 'S3', gradeCol: 'S', monthHeaderRow: 2, monthStartCol: 'T' },
        purchasesArabica: { startCell: 'S17', gradeCol: 'S', monthHeaderRow: 16, monthStartCol: 'T' }
      }
    }
  },
  {
    name: "Kenya",
    url: "https://sucafina0.sharepoint.com/:x:/r/sites/KENYACOF686/Shared%20Documents/General/KENYACOF/2025/001%20-%20Trade/001%20-%20Positions/1.%20Long%20-%20Short%20Position%20live.xlsm",
    config: {
      sheetName: "Summary",
      anchor: "Theoretical stocks",
      unit: "bags",
    }
  },
  {
    name: "Ethiopia",
    url: "https://sucafina0.sharepoint.com/:x:/s/SUCAFINAEthiopia/EUQetTaSrHhNsoGkLO1gHXYB0fs_nELkTTmQojMWItlOKw",
    config: {
      sheetName: "Long-Short Position",
      anchor: "SOL Grade",
      unit: "MT",
    }
  },
  {
    name: "Tanzania",
    url: "https://sucafina0.sharepoint.com/:x:/s/COTACOF/ESJR8mwEL7hHo39LgmcP3XYBWqLvfYOK0EmH6S04Q1jjgw?e=rGbc3G",
    config: {
      sheetName: "Long Short",
      unit: "MT",
      tables: [
        {
          coffeeType: "Arabica",
          startCell: "B9",
          gradeCol: "B",
          // Column H ("STL Green Estimate") holds parchment purchases already
          // converted to green equivalent; it now feeds into the "Total Stock"
          // column (I) via the sheet's own SUM formula, so pointing stockCol at
          // I picks it up automatically without double-counting.
          stockCol: "I",
          pastDueCol: "J",
          monthStartCol: "L"
        },
        {
          coffeeType: "Robusta",
          // Robusta's table sits below Arabica on the same sheet, so it shifted
          // right by the same two columns when Arabica's new "H" column was
          // inserted, even though Robusta itself has no parchment column.
          startCell: "B24",
          gradeCol: "B",
          stockCol: "I",
          pastDueCol: "J",
          monthStartCol: "L"
        }
      ]
    }
  }
];