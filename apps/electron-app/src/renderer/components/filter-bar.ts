/**
 * FilterBar - Tag filtering UI
 */

export class FilterBar {
  element: HTMLElement;
  private activeFilters: Set<string> = new Set();

  constructor() {
    this.element = this.createFilterBar();
  }

  private createFilterBar(): HTMLElement {
    const filterBar = document.createElement('div');
    filterBar.className = 'base-board-filter-bar';

    // Filter title
    const titleEl = document.createElement('h2');
    titleEl.className = 'base-board-filter-bar__title';
    titleEl.textContent = 'Filter by tag';
    filterBar.appendChild(titleEl);

    // Tag list container
    const tagList = document.createElement('div');
    tagList.className = 'base-board-filter-bar__tags';
    tagList.id = 'filter-tags';
    filterBar.appendChild(tagList);

    // Clear filters button
    const clearBtn = document.createElement('button');
    clearBtn.className = 'base-board-filter-bar__clear-btn';
    clearBtn.textContent = 'Clear filters';
    clearBtn.style.display = 'none';
    clearBtn.addEventListener('click', () => {
      this.activeFilters.clear();
      this.updateTagStyles();
      clearBtn.style.display = 'none';
    });
    filterBar.appendChild(clearBtn);

    return filterBar;
  }

  /**
   * Add a tag to the filter bar.
   */
  addTag(tag: string, color?: string): void {
    const tagList = this.element.querySelector('#filter-tags') as HTMLElement;
    if (!tagList) return;

    // Check if tag already exists
    if (this.element.querySelector(`[data-tag="${tag}"]`)) {
      return;
    }

    const tagEl = document.createElement('span');
    tagEl.className = 'base-board-filter-bar__tag';
    tagEl.dataset.tag = tag;
    tagEl.textContent = tag;
    
    if (color) {
      tagEl.style.backgroundColor = color;
    }

    tagEl.addEventListener('click', () => {
      if (this.activeFilters.has(tag)) {
        this.activeFilters.delete(tag);
      } else {
        this.activeFilters.add(tag);
      }
      
      this.updateTagStyles();
      
      // Emit filter change event
      const event = new CustomEvent('filter-change', { detail: Array.from(this.activeFilters) });
      this.element.dispatchEvent(event);
    });

    tagList.appendChild(tagEl);
  }

  private updateTagStyles(): void {
    const tags = this.element.querySelectorAll('.base-board-filter-bar__tag');
    const clearBtn = this.element.querySelector('.base-board-filter-bar__clear-btn') as HTMLElement;

    tags.forEach((tagEl) => {
      const tag = (tagEl as HTMLElement).dataset.tag!;
      if (this.activeFilters.has(tag)) {
        (tagEl as HTMLElement).classList.add('active');
      } else {
        (tagEl as HTMLElement).classList.remove('active');
      }
    });

    clearBtn.style.display = this.activeFilters.size > 0 ? 'inline-block' : 'none';
  }
}
