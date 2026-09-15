'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import consolidationMap from '../config/consolidationMap.json';
import { consolidatedCategories } from '../config/consolidatedCategories';

// A reusable mapping component for a single coffee type
function MappingSection({ coffeeType, allSourceGrades, initialMap, onMapChange }) {
    const categories = consolidatedCategories[coffeeType];
    const [unmapped, setUnmapped] = useState([]);
    const [mapped, setMapped] = useState({});

    useEffect(() => {
        const sourceGradesForType = allSourceGrades
            .filter(g => g.coffeeType === coffeeType)
            .map(g => g.grade);

        const initialMappedForType = {};
        categories.forEach(cat => initialMappedForType[cat] = []);
        
        const initialUnmapped = [];

        sourceGradesForType.forEach(grade => {
            const targetCategory = initialMap[grade];
            if (targetCategory && initialMappedForType[targetCategory]) {
                initialMappedForType[targetCategory].push(grade);
            } else {
                initialUnmapped.push(grade);
            }
        });
        
        // Sort the grades within each category
        for (const category in initialMappedForType) {
            initialMappedForType[category].sort();
        }

        setMapped(initialMappedForType);
        setUnmapped(initialUnmapped.sort());
    }, [allSourceGrades, coffeeType, categories, initialMap]);

    const handleMapChange = (newMappedData) => {
        const updatedMapForType = { ...initialMap };
         Object.entries(newMappedData).forEach(([category, grades]) => {
            grades.forEach(grade => {
                updatedMapForType[grade] = category;
            });
        });
        onMapChange(coffeeType, newMappedData);
    };

    const handleMapGrade = (gradeToMap, targetCategory) => {
        const newUnmapped = unmapped.filter(g => g !== gradeToMap);
        
        const newMapped = { ...mapped };
        // Ensure all categories exist
        categories.forEach(cat => {
            if (!newMapped[cat]) newMapped[cat] = [];
        });

        // Remove from any previous category, just in case
        for (const category in newMapped) {
            newMapped[category] = newMapped[category].filter(g => g !== gradeToMap);
        }
        newMapped[targetCategory] = [...newMapped[targetCategory], gradeToMap].sort();
        
        setUnmapped(newUnmapped);
        setMapped(newMapped);
        handleMapChange(newMapped);
    };

    // **NEW FUNCTION** to handle unmapping
    const handleUnmapGrade = (gradeToUnmap, currentCategory) => {
        const newMapped = { ...mapped };
        newMapped[currentCategory] = newMapped[currentCategory].filter(g => g !== gradeToUnmap);

        const newUnmapped = [...unmapped, gradeToUnmap].sort();

        setMapped(newMapped);
        setUnmapped(newUnmapped);
        handleMapChange(newMapped);
    };


    return (
        <div>
            <h2>{coffeeType} Mapping</h2>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                <div style={{ flex: 2, display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {categories.map(category => (
                        <div key={category} style={{ background: '#f0f0f0', padding: '10px', width: 'calc(50% - 10px)', minHeight: '150px' }}>
                            <h4>{category}</h4>
                            <ul style={{listStyleType: 'none', padding: 0, margin: 0}}>
                                {(mapped[category] || []).map(grade => ( 
                                    <li key={grade} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px'}}>
                                        <span>{grade}</span>
                                        {/* **NEW** Unmap button */}
                                        <button 
                                            onClick={() => handleUnmapGrade(grade, category)}
                                            style={{
                                                background: '#ddd', 
                                                border: 'none', 
                                                borderRadius: '50%', 
                                                width: '20px', 
                                                height: '20px', 
                                                cursor: 'pointer',
                                                lineHeight: '20px',
                                                textAlign: 'center'
                                            }}
                                        >
                                            &times;
                                        </button>
                                    </li> 
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ background: '#f0f0f0', padding: '10px', minHeight: '500px' }}>
                        <h4>Unmapped {coffeeType} Grades</h4>
                        <table style={{width: '100%'}}>
                            <tbody>
                                {unmapped.map(grade => (
                                    <tr key={grade}>
                                        <td style={{padding: '5px'}}>{grade}</td>
                                        <td style={{padding: '5px'}}>
                                            <select onChange={(e) => handleMapGrade(grade, e.target.value)} value="">
                                                <option value="" disabled>Assign to...</option>
                                                {categories.map(cat => ( <option key={cat} value={cat}>{cat}</option>))}
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}


export default function MappingPage() {
    const [allSourceGrades, setAllSourceGrades] = useState([]);
    const [currentMap, setCurrentMap] = useState(consolidationMap);
    const [status, setStatus] = useState('');

    useEffect(() => {
        const savedGrades = JSON.parse(localStorage.getItem('allSourceGrades')) || [];
        setAllSourceGrades(savedGrades);
    }, []);

    const handleMapChange = (coffeeType, newMappedData) => {
        const updatedMap = { ...currentMap };
        if (!updatedMap[coffeeType]) updatedMap[coffeeType] = {};
        
        // Create a fresh map for the coffee type based on the new data
        const newTypeMap = {};
        Object.entries(newMappedData).forEach(([category, grades]) => {
            grades.forEach(grade => {
                newTypeMap[grade] = category;
            });
        });

        updatedMap[coffeeType] = newTypeMap;
        setCurrentMap(updatedMap);
        setStatus('Changes pending...'); // Indicate that changes need to be saved
    };

    const handleSave = async () => {
        setStatus('Saving...');
        try {
            const response = await fetch('/api/consolidated_position/updateMap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentMap, null, 2),
            });
            if (!response.ok) throw new Error('Failed to save');
            setStatus('Map saved successfully!');
        } catch (error) {
            setStatus('Error saving map.');
        }
    };
    
    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <div>
                    <Link href="/consolidated_position">&larr; Back to Main Page</Link>
                    <h1>Grade Consolidation Mapping</h1>
                </div>
                <div>
                    <button onClick={handleSave} style={{padding: '10px 20px', fontSize: '16px'}}>Save Changes</button>
                    <span style={{marginLeft: '10px', fontStyle: 'italic'}}>{status}</span>
                </div>
            </div>
            <p>Select a category from the dropdown to map a grade, or click the '×' to unmap a grade.</p>
            <hr style={{margin: '20px 0'}}/>
            <MappingSection 
                coffeeType="Arabica" 
                allSourceGrades={allSourceGrades}
                initialMap={currentMap.Arabica}
                onMapChange={handleMapChange}
            />
            <hr style={{margin: '20px 0'}}/>
            <MappingSection 
                coffeeType="Robusta" 
                allSourceGrades={allSourceGrades}
                initialMap={currentMap.Robusta}
                onMapChange={handleMapChange}
            />
        </div>
    );
}